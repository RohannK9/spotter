import math
import threading
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime

from django.conf import settings

from planner.api.errors import ApplicationError, malformed
from planner.domain.models import Point, Weather
from planner.domain.units import centimeters_to_inches, millimeters_to_inches
from planner.providers.http import request_json


@dataclass(frozen=True)
class Forecast:
    hours: dict[int, Weather | None]
    fetched_at: str
    stale: bool = False

    def at(self, when: datetime) -> Weather | None:
        # Nearest hourly forecast, ties go forward; never extrapolate or skip missing hours.
        hour = math.floor((when.timestamp() + 1800) / 3600) * 3600
        return self.hours.get(hour)


def point_key(point: Point) -> tuple[float, float]:
    # ~100 m precision, shared by checkpoints and corridor forecasts.
    return round(point.lng, 3), round(point.lat, 3)


_cache: OrderedDict[tuple, tuple[float, Forecast]] = OrderedDict()
_cache_lock = threading.Lock()
_batch_locks = [threading.Lock() for _ in range(32)]
_provider_slots = threading.BoundedSemaphore(4)


def parse_forecast(data: dict) -> Forecast:
    try:
        hourly, units = data["hourly"], data["hourly_units"]
        if units["time"] != "unixtime" or units["wind_speed_10m"] != "mp/h":
            raise ValueError("Unexpected wind or time unit")
        for field in ("rain", "showers", "snowfall"):
            if units[field] not in {"inch", "mm", "cm"}:
                raise ValueError("Unexpected precipitation unit")
        fields = [
            hourly[name] for name in ("time", "wind_speed_10m", "rain", "showers", "snowfall")
        ]
        if not fields[0] or any(len(field) != len(fields[0]) for field in fields):
            raise ValueError("Mismatched forecast arrays")
        hours = {}
        previous = None
        for stamp, wind, rain, showers, snow in zip(*fields, strict=True):
            if (
                isinstance(stamp, bool)
                or not isinstance(stamp, (int, float))
                or not math.isfinite(stamp)
            ):
                raise ValueError("Invalid timestamp")
            if stamp % 3600 != 0 or (previous is not None and stamp <= previous):
                raise ValueError("Non-hourly or unordered timestamps")
            previous = stamp
            weather = None
            if all(
                isinstance(v, (int, float))
                and not isinstance(v, bool)
                and math.isfinite(v)
                and v >= 0
                for v in (wind, rain, showers, snow)
            ):

                def inches(value: float, field: str) -> float:
                    unit = units[field]
                    return (
                        centimeters_to_inches(value)
                        if unit == "cm"
                        else millimeters_to_inches(value)
                        if unit == "mm"
                        else value
                    )

                weather = Weather(
                    wind,
                    inches(rain, "rain") + inches(showers, "showers"),
                    inches(snow, "snowfall"),
                )
            hours[int(stamp)] = weather
        return Forecast(hours, datetime.now(UTC).isoformat())
    except (KeyError, TypeError, ValueError, AttributeError):
        raise malformed("Weather") from None


def fetch_forecasts(
    points: list[Point], start: datetime, end: datetime, request_id: str
) -> tuple[dict[tuple[float, float], Forecast], list[str]]:
    keys = sorted({point_key(point) for point in points})
    date_start, date_end = start.date().isoformat(), end.date().isoformat()
    results: dict[tuple[float, float], Forecast] = {}
    failures = 0
    deadline = time.monotonic() + 65

    def batch(coordinates: list[tuple[float, float]]) -> tuple[dict, int]:
        # Identical batches share in-flight work. Cache remains bounded and process-local.
        lock = _batch_locks[hash(tuple(coordinates)) % len(_batch_locks)]
        if not lock.acquire(timeout=max(0.01, deadline - time.monotonic())):
            return {}, len(coordinates)
        try:
            found, pending, stale = {}, [], {}
            now = time.monotonic()
            with _cache_lock:
                for coord in coordinates:
                    entry = _cache.get((coord, date_start, date_end))
                    if entry and now - entry[0] <= settings.WEATHER_CACHE_SECONDS:
                        found[coord] = entry[1]
                    else:
                        pending.append(coord)
                        if entry and now - entry[0] <= settings.WEATHER_STALE_SECONDS:
                            stale[coord] = Forecast(entry[1].hours, entry[1].fetched_at, True)
            if not pending:
                return found, 0
            if time.monotonic() >= deadline:
                return found, len(pending)
            acquired = _provider_slots.acquire(timeout=max(0.01, deadline - time.monotonic()))
            if not acquired:
                found.update(stale)
                return found, len(pending) - len(stale)
            try:
                data = request_json(
                    "Weather",
                    "GET",
                    "https://api.open-meteo.com/v1/forecast",
                    request_id=request_id,
                    params={
                        "latitude": ",".join(str(c[1]) for c in pending),
                        "longitude": ",".join(str(c[0]) for c in pending),
                        "hourly": "wind_speed_10m,rain,showers,snowfall",
                        "wind_speed_unit": "mph",
                        "precipitation_unit": "inch",
                        "timezone": "UTC",
                        "timeformat": "unixtime",
                        "start_date": date_start,
                        "end_date": date_end,
                    },
                )
            except ApplicationError as exc:
                if exc.retryable:
                    found.update(stale)
                return found, len(coordinates) - len(found)
            finally:
                _provider_slots.release()
            rows = data if isinstance(data, list) else [data]
            if len(rows) != len(pending):
                return found, len(pending)
            failed = 0
            for coord, row in zip(pending, rows, strict=True):
                try:
                    forecast = parse_forecast(row)
                except ApplicationError:
                    failed += 1
                    continue
                found[coord] = forecast
                with _cache_lock:
                    key = (coord, date_start, date_end)
                    _cache[key] = (time.monotonic(), forecast)
                    _cache.move_to_end(key)
                    while len(_cache) > 1500:
                        _cache.popitem(last=False)
            return found, failed
        finally:
            lock.release()

    batches = [keys[i : i + 20] for i in range(0, len(keys), 20)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        for found, failed in pool.map(batch, batches):
            results.update(found)
            failures += failed
    notices = []
    if failures:
        notices.append(
            "Some weather forecasts could not be retrieved. Missing data is marked "
            "unavailable and is excluded from safety recommendations."
        )
    if any(f.stale for f in results.values()):
        notices.append(
            "Using recently cached weather data because live data is temporarily unavailable."
        )
    return results, notices
