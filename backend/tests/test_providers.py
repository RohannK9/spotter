import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from unittest.mock import Mock

import httpx
import pytest

from planner.api.errors import ApplicationError
from planner.domain.models import Point, Weather
from planner.providers import geocoding, google_routes, http, open_meteo


def forecast_payload():
    return {
        "hourly_units": {
            "time": "unixtime",
            "wind_speed_10m": "mp/h",
            "rain": "inch",
            "showers": "inch",
            "snowfall": "inch",
        },
        "hourly": {
            "time": [0, 3600, 7200],
            "wind_speed_10m": [25, None, 35],
            "rain": [0.1, 0, 0],
            "showers": [0.15, 0, 0],
            "snowfall": [0, 0, 0],
        },
    }


def test_nearest_hour_units_and_missing_weather():
    forecast = open_meteo.parse_forecast(forecast_payload())
    assert forecast.at(datetime.fromtimestamp(1799, UTC)) == Weather(25, 0.25, 0)
    assert forecast.at(datetime.fromtimestamp(1800, UTC)) is None
    assert forecast.at(datetime.fromtimestamp(5400, UTC)) == Weather(35, 0, 0)
    assert forecast.at(datetime.fromtimestamp(100_000, UTC)) is None


def test_provider_units_are_validated_and_converted():
    data = forecast_payload()
    data["hourly_units"]["snowfall"] = "cm"
    data["hourly"]["snowfall"][0] = 2.54
    assert open_meteo.parse_forecast(data).hours[0].snow_in == pytest.approx(1)
    data["hourly_units"]["wind_speed_10m"] = "km/h"
    with pytest.raises(ApplicationError, match="invalid data"):
        open_meteo.parse_forecast(data)


@pytest.mark.parametrize(
    "change",
    [
        lambda d: d["hourly"].pop("snowfall"),
        lambda d: d["hourly"]["rain"].pop(),
        lambda d: d["hourly"]["time"].__setitem__(1, 0),
    ],
)
def test_malformed_forecasts_are_not_assumed_safe(change):
    data = forecast_payload()
    change(data)
    with pytest.raises(ApplicationError):
        open_meteo.parse_forecast(data)


@pytest.mark.parametrize("status,attempts", [(401, 1), (400, 1), (403, 1), (429, 3), (503, 3)])
def test_transient_retries_only(monkeypatch, status, attempts):
    calls = []
    client = httpx.Client

    def handle(request):
        calls.append(request)
        return httpx.Response(status, json={"error": "provider-secret-must-not-leak"})

    monkeypatch.setattr(
        http.httpx,
        "Client",
        lambda **kwargs: client(transport=httpx.MockTransport(handle), **kwargs),
    )
    monkeypatch.setattr(http.time, "sleep", lambda _: None)
    with pytest.raises(ApplicationError) as exc:
        http.request_json("Test", "GET", "https://provider.example")
    assert len(calls) == attempts
    assert "provider-secret" not in str(exc.value)


def test_timeout_then_success(monkeypatch):
    calls = []
    client = httpx.Client

    def handle(request):
        calls.append(request)
        if len(calls) == 1:
            raise httpx.ReadTimeout("secret-url", request=request)
        return httpx.Response(200, json={"ok": True})

    monkeypatch.setattr(
        http.httpx,
        "Client",
        lambda **kwargs: client(transport=httpx.MockTransport(handle), **kwargs),
    )
    sleep = Mock()
    monkeypatch.setattr(http.time, "sleep", sleep)
    assert http.request_json("Test", "GET", "https://provider.example") == {"ok": True}
    assert 0.25 <= sleep.call_args.args[0] <= 0.45


def test_google_polyline_and_malformed_geometry():
    points = google_routes.decode_polyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")
    assert points == (Point(-120.2, 38.5), Point(-120.95, 40.7), Point(-126.453, 43.252))
    with pytest.raises(ValueError):
        google_routes.decode_polyline("_")


def test_route_partial_failure_and_step_timing(monkeypatch):
    row = {
        "distanceMeters": 100,
        "duration": "20s",
        "polyline": {"encodedPolyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@"},
        "legs": [
            {
                "steps": [
                    {"distanceMeters": 25, "staticDuration": "15s"},
                    {"distanceMeters": 75, "staticDuration": "5s"},
                ]
            }
        ],
    }
    monkeypatch.setattr(google_routes, "request_json", lambda *a, **k: {"routes": [row, {}, row]})
    routes, notices = google_routes.get_routes(Point(0, 0), Point(1, 1), datetime.now(UTC), "test")
    assert len(routes) == 2
    assert routes[0].timing == ((0, 0), (0.25, 0.75), (1, 1))
    assert any("Only 2" in notice for notice in notices)


def test_geocoding_partial_and_zero_results(monkeypatch):
    response = {
        "results": [
            {
                "place_id": "a",
                "formatted_address": "Springfield, Illinois",
                "partial_match": True,
                "geometry": {"location": {"lat": 39, "lng": -89}},
            }
        ]
    }
    monkeypatch.setattr(geocoding, "request_json", lambda *a, **k: response)
    assert geocoding.search_locations("Springfield", "test")[0]["partial_match"] is True
    response["results"] = []
    assert geocoding.search_locations("invalid", "test") == []


@pytest.fixture(autouse=True)
def clear_weather_cache():
    open_meteo._cache.clear()
    yield
    open_meteo._cache.clear()


def test_weather_cache_dedup_and_stale_label(monkeypatch):
    start = datetime.now(UTC)
    end = start + timedelta(days=2)
    point = Point(-105, 40)
    provider = Mock(return_value=forecast_payload())
    monkeypatch.setattr(open_meteo, "request_json", provider)
    result, _ = open_meteo.fetch_forecasts([point, point], start, end, "test")
    assert provider.call_count == 1
    assert not result[(-105, 40)].stale
    open_meteo.fetch_forecasts([point], start, end, "test")
    assert provider.call_count == 1
    cache_key = next(iter(open_meteo._cache))
    _, forecast = open_meteo._cache[cache_key]
    open_meteo._cache[cache_key] = (time.monotonic() - 700, forecast)
    provider.side_effect = ApplicationError("Unavailable", retryable=True)
    result, notices = open_meteo.fetch_forecasts([point], start, end, "test")
    assert result[(-105, 40)].stale
    assert any("cached" in notice for notice in notices)
    provider.side_effect = ApplicationError("Invalid key", retryable=False)
    result, _ = open_meteo.fetch_forecasts([point], start, end, "test")
    assert not result


def test_expired_weather_is_never_used(monkeypatch):
    start = datetime.now(UTC)
    point = Point(0, 0)
    open_meteo._cache[((0, 0), start.date().isoformat(), start.date().isoformat())] = (
        time.monotonic() - 2000,
        open_meteo.parse_forecast(forecast_payload()),
    )
    monkeypatch.setattr(
        open_meteo, "request_json", Mock(side_effect=ApplicationError("Down", retryable=True))
    )
    result, _ = open_meteo.fetch_forecasts([point], start, start, "test")
    assert not result


def test_weather_concurrency_and_identical_inflight_dedup(monkeypatch):
    active = peak = calls = 0
    guard = threading.Lock()

    def provider(*args, **kwargs):
        nonlocal active, peak, calls
        with guard:
            active += 1
            calls += 1
            peak = max(peak, active)
        time.sleep(0.01)
        count = len(kwargs["params"]["latitude"].split(","))
        with guard:
            active -= 1
        return [forecast_payload() for _ in range(count)]

    monkeypatch.setattr(open_meteo, "request_json", provider)
    points = [Point(-100 + i * 0.1, 40) for i in range(100)]
    start = datetime.now(UTC)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(open_meteo.fetch_forecasts, points, start, start, "test") for _ in range(2)
        ]
        results = [f.result() for f in futures]
    assert all(len(result[0]) == 100 for result in results)
    assert calls == 5  # Both concurrent analyses share the same five 20-coordinate batches.
    assert 1 < peak <= 4
