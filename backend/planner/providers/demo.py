"""Deterministic, synthetic fixtures. Only selected explicitly via PROVIDER_MODE=demo."""

import math
from datetime import UTC, datetime

from planner.domain.models import Point, Route, Weather
from planner.domain.sampling import distance, interpolate
from planner.providers.open_meteo import Forecast, point_key

LOCATIONS = [
    {"id": "demo-denver", "label": "Denver, Colorado, USA", "point": [-104.9903, 39.7392]},
    {"id": "demo-salt-lake", "label": "Salt Lake City, Utah, USA", "point": [-111.891, 40.7608]},
    {"id": "demo-cheyenne", "label": "Cheyenne, Wyoming, USA", "point": [-104.8202, 41.14]},
    {"id": "demo-kansas", "label": "Kansas City, Missouri, USA", "point": [-94.5786, 39.0997]},
]


def search_locations(query: str, request_id: str) -> list[dict]:
    return [
        {**loc, "partial_match": False}
        for loc in LOCATIONS
        if query.casefold() in loc["label"].casefold()
    ]


def get_routes(
    origin: Point, destination: Point, departure: datetime, request_id: str
) -> tuple[list[Route], list[str]]:
    routes = []
    for index, bend in enumerate([0, 0.75, -0.6]):
        geometry = []
        for i in range(61):
            fraction = i / 60
            p = interpolate(origin, destination, fraction)
            geometry.append(
                Point(p.lng, max(-89, min(89, p.lat + bend * math.sin(math.pi * fraction))))
            )
        meters = sum(distance(a, b) for a, b in zip(geometry, geometry[1:], strict=False))
        routes.append(
            Route(
                f"Route {chr(65 + index)}",
                ["Central corridor", "Northern corridor", "Southern corridor"][index],
                tuple(geometry),
                meters,
                meters / 23,
                ((0, 0), (0.4, 0.45), (1, 1)),
            )
        )
    return routes, [
        "DEMO: Synthetic routes and weather for review only. These are not road directions "
        "or live forecasts and must not be used for travel."
    ]


def fetch_forecasts(
    points: list[Point], start: datetime, end: datetime, request_id: str
) -> tuple[dict, list[str]]:
    output = {}
    first = int(start.timestamp() // 3600) * 3600
    last = int(end.timestamp() // 3600) * 3600
    for point in points:
        key = point_key(point)
        if key in output:
            continue
        hours = {}
        for stamp in range(first, last + 3601, 3600):
            phase = (stamp - first) / 3600
            storm = max(0, 1 - abs(point.lng + 108) / 2)
            wind = max(0, 13 + storm * (26 + (point.lat - 40) * 15) + 5 * math.sin(phase / 6))
            rain = max(0, storm * 0.15 * math.sin(phase / 9))
            hours[stamp] = Weather(wind, rain, 0)
        output[key] = Forecast(hours, datetime.now(UTC).isoformat())
    return output, []
