import math
from datetime import UTC, datetime

from django.conf import settings

from planner.api.errors import ApplicationError, malformed
from planner.domain.models import Point, Route
from planner.providers.http import request_json


def decode_polyline(encoded: str) -> tuple[Point, ...]:
    if not isinstance(encoded, str) or len(encoded) > 2_000_000:
        raise ValueError("Invalid encoded geometry")
    coordinates, index, lat, lng = [], 0, 0, 0
    while index < len(encoded):
        delta = []
        for _ in range(2):
            result = shift = 0
            while True:
                if index >= len(encoded) or shift > 30:
                    raise ValueError("Malformed polyline")
                byte = ord(encoded[index]) - 63
                index += 1
                if not 0 <= byte <= 63:
                    raise ValueError("Malformed polyline")
                result |= (byte & 31) << shift
                shift += 5
                if byte < 32:
                    break
            delta.append(~(result >> 1) if result & 1 else result >> 1)
        lat += delta[0]
        lng += delta[1]
        coordinates.append(Point(lng / 1e5, lat / 1e5))
    return tuple(coordinates)


def seconds(value: str) -> float:
    if not isinstance(value, str) or not value.endswith("s"):
        raise ValueError("Missing duration")
    result = float(value[:-1])
    if not math.isfinite(result) or result < 0:
        raise ValueError("Invalid duration")
    return result


def step_timing(row: dict) -> tuple[tuple[float, float], ...]:
    """Normalize static step timings to the traffic-aware route duration at sampling time."""
    try:
        steps = [step for leg in row["legs"] for step in leg["steps"]]
        distances = [float(s["distanceMeters"]) for s in steps]
        durations = [seconds(s["staticDuration"]) for s in steps]
        if any(not math.isfinite(d) or d < 0 for d in distances):
            return ()
        total_d, total_t = sum(distances), sum(durations)
        if total_d <= 0 or total_t <= 0:
            return ()
        knots, d, t = [(0.0, 0.0)], 0.0, 0.0
        for length, duration in zip(distances, durations, strict=True):
            d += length
            t += duration
            if length > 0:
                knots.append((d / total_d, t / total_t))
        knots[-1] = (1.0, 1.0)
        return tuple(knots)
    except (KeyError, TypeError, ValueError):
        return ()


def get_routes(
    origin: Point, destination: Point, departure: datetime, request_id: str
) -> tuple[list[Route], list[str]]:
    def waypoint(p: Point) -> dict:
        return {"location": {"latLng": {"latitude": p.lat, "longitude": p.lng}}}

    data = request_json(
        "Routing",
        "POST",
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        request_id=request_id,
        headers={
            "X-Goog-Api-Key": settings.GOOGLE_ROUTES_API_KEY,
            "X-Goog-FieldMask": "routes.description,routes.distanceMeters,"
            "routes.duration,routes.polyline.encodedPolyline,"
            "routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration",
        },
        json={
            "origin": waypoint(origin),
            "destination": waypoint(destination),
            "travelMode": "DRIVE",
            "routingPreference": "TRAFFIC_AWARE",
            "computeAlternativeRoutes": True,
            "polylineQuality": "HIGH_QUALITY",
            "departureTime": departure.astimezone(UTC).isoformat(),
            "units": "IMPERIAL",
        },
    )
    if not isinstance(data, dict) or not isinstance(data.get("routes", []), list):
        raise malformed("Routing")
    routes, notices = [], []
    for index, row in enumerate(data.get("routes", [])[:3]):
        try:
            routes.append(
                Route(
                    f"Route {chr(65 + index)}",
                    str(row.get("description") or f"Alternative {index + 1}"),
                    decode_polyline(row["polyline"]["encodedPolyline"]),
                    float(row["distanceMeters"]),
                    seconds(row["duration"]),
                    step_timing(row),
                )
            )
        except (KeyError, TypeError, ValueError, AttributeError):
            notices.append(
                f"Route {index + 1} returned incomplete routing data and could not be analyzed."
            )
    if not routes:
        if data.get("routes"):
            raise malformed("Routing")
        raise ApplicationError(
            "No suitable route alternatives were returned for this trip. "
            "Try adjusting the origin, destination, or departure time.",
            "no_routes",
            422,
            "Routing",
        )
    if len(routes) < 3:
        notices.append(f"Only {len(routes)} route alternatives were available for this trip.")
    return routes, notices
