from dataclasses import replace
from datetime import UTC, datetime, timedelta
from unittest.mock import Mock

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from planner.api.errors import ApplicationError
from planner.domain.models import Weather
from planner.providers import demo
from planner.providers.open_meteo import Forecast
from planner.services import analysis


@pytest.fixture
def client():
    cache.clear()
    return APIClient()


@pytest.fixture
def trip():
    return {
        "origin": {"label": "Denver, CO", "point": [-104.99, 39.739]},
        "destination": {"label": "Salt Lake City, UT", "point": [-111.891, 40.76]},
        "departure": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
        "load_lb": 32000,
        "interval_miles": 25,
    }


def test_full_analysis_contract(client, trip):
    response = client.post("/api/analyze/", trip, format="json")
    assert response.status_code == 200
    data = response.json()
    assert data["mode"] == "demo"
    assert len(data["routes"]) == 3
    assert response["X-Request-ID"] == data["request_id"]
    assert data["recommendation"]["route_id"] is not None
    for route in data["routes"]:
        assert route["checkpoints"][0]["miles"] == 0
        assert route["checkpoints"][-1]["miles"] == route["distance_miles"]
        assert route["heatmap"]["max_hour"] == 48
        assert all(len(point["risks"]) == 49 for point in route["heatmap"]["points"])


@pytest.mark.parametrize(
    "field,value",
    [
        ("origin", None),
        ("destination", None),
        ("load_lb", 0),
        ("load_lb", -1),
        ("interval_miles", 11),
        ("departure", "not-a-date"),
        ("departure", "2026-01-01T10:00:00"),
        ("origin", {"label": "bad", "point": [181, 90]}),
    ],
)
def test_validation_errors(client, trip, field, value):
    trip[field] = value
    response = client.post("/api/analyze/", trip, format="json")
    assert response.status_code == 400
    assert response.json()["error"]["category"] == "validation_error"
    assert field in response.json()["error"]["details"]


def test_past_and_outside_forecast_window(client, trip):
    for delta in [-1, 49]:
        trip["departure"] = (datetime.now(UTC) + timedelta(hours=delta)).isoformat()
        assert client.post("/api/analyze/", trip, format="json").status_code == 400


def test_same_locations_and_large_finite_weight(client, trip):
    original = trip["destination"]
    trip["destination"] = trip["origin"]
    assert client.post("/api/analyze/", trip, format="json").status_code == 400
    trip["destination"] = original
    trip["load_lb"] = 1e100  # No invented upper weight business rule.
    assert client.post("/api/analyze/", trip, format="json").status_code == 200


def test_weather_timeout_preserves_routes(client, trip, monkeypatch):
    monkeypatch.setattr(
        demo, "fetch_forecasts", Mock(side_effect=ApplicationError("Timeout", "timeout"))
    )
    response = client.post("/api/analyze/", trip, format="json")
    data = response.json()
    assert response.status_code == 200
    assert len(data["routes"]) == 3
    assert data["recommendation"]["route_id"] is None
    assert data["recommendation"]["status"] == "INCOMPLETE"
    assert data["routes"][0]["checkpoints"][0]["risk"] is None
    assert any("Safety recommendations are temporarily unavailable" in n for n in data["notices"])


def test_one_missing_checkpoint_excludes_route(client, trip, monkeypatch):
    original = demo.fetch_forecasts

    def missing(points, *args):
        forecasts, notices = original(points, *args)
        forecasts.pop(next(iter(forecasts)))  # Shared origin is unknown for all alternatives.
        return forecasts, notices

    monkeypatch.setattr(demo, "fetch_forecasts", missing)
    data = client.post("/api/analyze/", trip, format="json").json()
    assert data["recommendation"]["route_id"] is None
    assert data["routes"][0]["assessment"]["coverage"] < 1
    assert data["routes"][0]["checkpoints"][0]["status"] == "WEATHER_UNAVAILABLE"


def test_all_routes_no_travel(client, trip, monkeypatch):
    original = demo.fetch_forecasts

    def storm(points, *args):
        forecasts, notices = original(points, *args)
        return {
            key: Forecast({h: Weather(60, 0, 0) for h in f.hours}, f.fetched_at)
            for key, f in forecasts.items()
        }, notices

    monkeypatch.setattr(demo, "fetch_forecasts", storm)
    data = client.post("/api/analyze/", trip, format="json").json()
    assert data["recommendation"]["status"] == "NO_SAFE_ROUTE"
    assert data["recommendation"]["route_id"] is None


def test_invalid_route_and_failed_corridor_preserve_other_results(client, trip, monkeypatch):
    original = demo.get_routes

    def routes(*args):
        routes, notices = original(*args)
        routes[0] = replace(routes[0], geometry=(routes[0].geometry[0], routes[0].geometry[0]))
        return routes, notices

    monkeypatch.setattr(demo, "get_routes", routes)
    monkeypatch.setattr(analysis, "corridor_points", Mock(side_effect=ValueError("Unavailable")))
    data = client.post("/api/analyze/", trip, format="json").json()
    assert len(data["routes"]) == 2
    assert data["routes"][0]["heatmap"]["max_hour"] == -1
    assert data["routes"][0]["assessment"]["complete"]


def test_routing_timeout_and_internal_errors_are_safe(client, trip, monkeypatch):
    for error, expected in [
        (ApplicationError("Routing timed out. Try again.", "timeout", 504), 504),
        (RuntimeError("SECRET_PROVIDER_RESPONSE"), 500),
    ]:
        monkeypatch.setattr(demo, "get_routes", Mock(side_effect=error))
        response = client.post("/api/analyze/", trip, format="json")
        assert response.status_code == expected
        assert "SECRET" not in response.content.decode()
        assert response.json()["error"]["request_id"]


def test_location_search_and_cors(client):
    response = client.get("/api/locations/?query=Denver", HTTP_ORIGIN="http://localhost:5173")
    assert response.json()["results"][0]["label"] == "Denver, Colorado, USA"
    assert response["Access-Control-Allow-Origin"] == "http://localhost:5173"
    response = client.get(
        "/api/locations/?query=not-a-city", HTTP_ORIGIN="https://untrusted.example"
    )
    assert response.json()["results"] == []
    assert "Access-Control-Allow-Origin" not in response
