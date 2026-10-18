from bisect import bisect_right
from datetime import datetime, timedelta
from math import asin, atan2, cos, degrees, radians, sin, sqrt

from planner.domain.models import Checkpoint, Point, Route
from planner.domain.units import EARTH_RADIUS_METERS, METERS_PER_MILE, meters_to_miles


def distance(a: Point, b: Point) -> float:
    lat1, lat2 = radians(a.lat), radians(b.lat)
    dlat, dlng = lat2 - lat1, radians(b.lng - a.lng)
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_METERS * asin(min(1, sqrt(h)))


def interpolate(a: Point, b: Point, fraction: float) -> Point:
    """Great-circle interpolation, including routes crossing the antimeridian."""
    angle = distance(a, b) / EARTH_RADIUS_METERS
    if angle < 1e-12:
        return a
    left, right = sin((1 - fraction) * angle) / sin(angle), sin(fraction * angle) / sin(angle)
    lat1, lat2, lng1, lng2 = map(radians, (a.lat, b.lat, a.lng, b.lng))
    x = left * cos(lat1) * cos(lng1) + right * cos(lat2) * cos(lng2)
    y = left * cos(lat1) * sin(lng1) + right * cos(lat2) * sin(lng2)
    z = left * sin(lat1) + right * sin(lat2)
    return Point(degrees(atan2(y, x)), degrees(atan2(z, sqrt(x * x + y * y))))


def travel_fraction(fraction: float, timing: tuple[tuple[float, float], ...]) -> float:
    if not timing:
        return fraction
    index = min(bisect_right(timing, (fraction, float("inf"))), len(timing) - 1)
    if index == 0:
        return timing[0][1]
    d0, t0 = timing[index - 1]
    d1, t1 = timing[index]
    return t1 if d1 == d0 else t0 + (t1 - t0) * (fraction - d0) / (d1 - d0)


def sample_route(route: Route, interval_miles: float, departure: datetime) -> list[Checkpoint]:
    if departure.tzinfo is None or departure.utcoffset() is None:
        raise ValueError("Departure must include a timezone.")
    if interval_miles <= 0:
        raise ValueError("Checkpoint interval must be positive.")
    cumulative = [0.0]
    for a, b in zip(route.geometry, route.geometry[1:], strict=False):
        cumulative.append(cumulative[-1] + distance(a, b))
    if cumulative[-1] <= 0:
        raise ValueError("Route geometry has no measurable length.")
    total = meters_to_miles(route.distance_meters)
    positions = [i * interval_miles for i in range(int(total // interval_miles) + 1)]
    if total - positions[-1] > 1e-8:
        positions.append(total)
    else:
        positions[-1] = total
    points: list[Checkpoint] = []
    segment = 1
    for miles in positions:
        fraction = miles / total
        target = fraction * cumulative[-1]
        while segment < len(cumulative) - 1 and cumulative[segment] < target:
            segment += 1
        length = cumulative[segment] - cumulative[segment - 1]
        ratio = (target - cumulative[segment - 1]) / length if length else 0
        point = interpolate(route.geometry[segment - 1], route.geometry[segment], ratio)
        if miles == 0:
            point = route.geometry[0]
        elif miles == total:
            point = route.geometry[-1]
        eta = departure + timedelta(
            seconds=route.duration_seconds * travel_fraction(fraction, route.timing)
        )
        points.append(Checkpoint(point, miles, eta))
    return points


def offset(point: Point, meters: float, bearing_degrees: float) -> Point:
    angle, bearing, lat, lng = (
        meters / EARTH_RADIUS_METERS,
        radians(bearing_degrees),
        radians(point.lat),
        radians(point.lng),
    )
    lat2 = asin(sin(lat) * cos(angle) + cos(lat) * sin(angle) * cos(bearing))
    lng2 = lng + atan2(sin(bearing) * sin(angle) * cos(lat), cos(angle) - sin(lat) * sin(lat2))
    return Point((degrees(lng2) + 180) % 360 - 180, degrees(lat2))


def corridor_points(route: Route, departure: datetime) -> list[Point]:
    """At most 30 stations with points ~5 miles to either side of the travel bearing."""
    stations = sample_route(route, max(25, meters_to_miles(route.distance_meters) / 29), departure)
    result = []
    for index, station in enumerate(stations):
        a = stations[max(0, index - 1)].point
        b = stations[min(len(stations) - 1, index + 1)].point
        dlng = radians(b.lng - a.lng)
        bearing = degrees(
            atan2(
                sin(dlng) * cos(radians(b.lat)),
                cos(radians(a.lat)) * sin(radians(b.lat))
                - sin(radians(a.lat)) * cos(radians(b.lat)) * cos(dlng),
            )
        )
        result.extend(
            [
                station.point,
                offset(station.point, 5 * METERS_PER_MILE, bearing - 90),
                offset(station.point, 5 * METERS_PER_MILE, bearing + 90),
            ]
        )
    return result
