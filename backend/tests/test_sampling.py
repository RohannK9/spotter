from datetime import UTC, datetime

import pytest

from planner.domain.models import Point, Route
from planner.domain.sampling import corridor_points, distance, interpolate, sample_route
from planner.domain.units import METERS_PER_MILE

DEPARTURE = datetime(2026, 10, 18, 12, tzinfo=UTC)


def route(miles=62, timing=()):
    return Route(
        "A", "A", (Point(0, 0), Point(0.5, 0), Point(1, 0)), miles * METERS_PER_MILE, 7200, timing
    )


def test_sampling_includes_interpolated_points_and_destination():
    points = sample_route(route(), 25, DEPARTURE)
    assert [p.miles for p in points] == pytest.approx([0, 25, 50, 62])
    assert points[1].point.lng == pytest.approx(25 / 62)
    assert points[-1].point == Point(1, 0)
    assert (points[-1].eta - DEPARTURE).total_seconds() == 7200


def test_exact_interval_does_not_duplicate_endpoint():
    assert len(sample_route(route(50), 25, DEPARTURE)) == 3
    assert len(sample_route(route(3), 25, DEPARTURE)) == 2


def test_segment_timing_and_utc_offsets():
    departure = datetime.fromisoformat("2026-10-18T17:30:00+05:30")
    points = sample_route(route(100, ((0, 0), (0.5, 0.75), (1, 1))), 25, departure)
    assert (points[2].eta - DEPARTURE).total_seconds() == 5400
    assert (points[1].eta - DEPARTURE).total_seconds() == 2700


def test_antimeridian_and_distance():
    middle = interpolate(Point(179, 0), Point(-179, 0), 0.5)
    assert abs(middle.lng) == pytest.approx(180)
    assert distance(Point(0, 0), Point(1, 0)) == pytest.approx(111195, abs=1)


def test_duplicate_vertices_and_zero_geometry():
    r = Route("A", "A", (Point(0, 0), Point(0, 0), Point(1, 0)), 100, 10)
    assert len(sample_route(r, 25, DEPARTURE)) == 2
    with pytest.raises(ValueError, match="measurable"):
        sample_route(Route("A", "A", (Point(0, 0), Point(0, 0)), 100, 10), 25, DEPARTURE)


def test_timezone_required():
    with pytest.raises(ValueError, match="timezone"):
        sample_route(route(), 25, datetime(2026, 10, 18))


def test_corridor_bounded_and_not_just_centerline():
    points = corridor_points(route(3000), DEPARTURE)
    assert len(points) <= 90
    assert abs(points[1].lat) > 0.01
