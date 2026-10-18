from dataclasses import replace
from datetime import UTC, datetime

import pytest

from planner.domain.models import Assessment, Checkpoint, Point, Risk
from planner.domain.recommendation import aggregate, recommend


def assessment(id="A", **kwargs):
    base = Assessment(id, 0, 0, 0, 0, 0, 1, False, True, 1000)
    return replace(base, **kwargs)


def test_distance_weighted_mileage_and_average():
    points = [Checkpoint(Point(0, 0), miles, datetime.now(UTC)) for miles in [0, 25, 30]]
    result = aggregate("A", points, [Risk.LOW, Risk.HIGH, Risk.SEVERE], 1000)
    assert result.high_miles == 25
    assert result.severe_miles == 5
    assert result.average_risk == pytest.approx(65 / 30)
    assert result.coverage == 1


def test_unknown_is_never_counted_as_low():
    points = [Checkpoint(Point(0, 0), miles, datetime.now(UTC)) for miles in [0, 25, 30]]
    result = aggregate("A", points, [Risk.LOW, Risk.LOW, None], 1000)
    assert result.unknown_miles == 5
    assert result.average_risk == 0
    assert result.coverage == 25 / 30
    assert not result.viable


def test_no_travel_at_unknown_segment_endpoint_still_blocks():
    points = [Checkpoint(Point(0, 0), miles, datetime.now(UTC)) for miles in [0, 25]]
    assert aggregate("A", points, [Risk.NO_TRAVEL, None], 1).blocked


@pytest.mark.parametrize(
    "worse",
    [
        {"severe_miles": 0.1, "high_miles": 0, "average_risk": 0, "duration_seconds": 1},
        {"high_miles": 0.1, "average_risk": 0, "duration_seconds": 1},
        {"average_risk": 1, "duration_seconds": 1},
        {"duration_seconds": 1001},
    ],
)
def test_exact_lexicographic_order(worse):
    assert recommend([assessment("B", **worse), assessment()])["route_id"] == "A"


def test_hard_constraint_and_incomplete_exclusion():
    result = recommend(
        [
            assessment("A", blocked=True),
            assessment("B", complete=False),
            assessment("C", severe_miles=100),
        ]
    )
    assert result["route_id"] == "C"


def test_all_no_travel_and_stable_ties():
    result = recommend([assessment("B", blocked=True), assessment("A", blocked=True)])
    assert result["status"] == "NO_SAFE_ROUTE"
    assert result["route_id"] is None
    assert result["ranking"] == ["A", "B"]
    assert recommend([assessment("B"), assessment("A")])["route_id"] == "A"


def test_all_unknown_is_incomplete_not_unsafe_or_safe():
    result = recommend([assessment(complete=False, average_risk=None)])
    assert result["status"] == "INCOMPLETE"
    assert result["route_id"] is None


def test_explanation_does_not_round_small_difference_to_zero():
    result = recommend([assessment("A"), assessment("B", severe_miles=0.001)])
    assert "<0.1 fewer Severe-risk miles" in result["explanation"]
