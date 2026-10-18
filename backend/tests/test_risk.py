import pytest

from planner.domain.models import Risk, Weather
from planner.domain.risk import checkpoint_risk, rain_risk, snow_risk, wind_risk


@pytest.mark.parametrize(
    "boundary,below,at,above",
    [
        (25, 0, 1, 1),
        (35, 1, 2, 2),
        (45, 2, 3, 3),
        (55, 3, 4, 4),
    ],
)
def test_wind_boundaries(boundary, below, at, above):
    assert [wind_risk(boundary + delta, 10_000) for delta in (-0.001, 0, 0.001)] == [
        below,
        at,
        above,
    ]


@pytest.mark.parametrize(
    "boundary,below,at,above",
    [
        (0.1, 0, 1, 1),
        (0.25, 1, 2, 2),
        (0.5, 2, 3, 3),
        (1, 3, 3, 4),
    ],
)
def test_rain_boundaries(boundary, below, at, above):
    assert [rain_risk(boundary + delta) for delta in (-0.0001, 0, 0.0001)] == [below, at, above]


@pytest.mark.parametrize(
    "boundary,below,at,above",
    [
        (0.5, 0, 1, 1),
        (1, 1, 2, 2),
        (2, 2, 3, 3),
        (3, 3, 3, 4),
    ],
)
def test_snow_boundaries(boundary, below, at, above):
    assert [snow_risk(boundary + delta) for delta in (-0.0001, 0, 0.0001)] == [below, at, above]


@pytest.mark.parametrize(
    "wind,load,expected",
    [
        (45, 29999.99, 3),
        (45, 30000, 3),
        (45, 30000.01, 4),
        (35, 39999.99, 2),
        (35, 40000, 2),
        (35, 40000.01, 3),
        (34.999, 50000, 1),
        (44.999, 30001, 2),
        (54.999, 1, 3),
        (55, 1, 4),
    ],
)
def test_load_overrides(wind, load, expected):
    assert wind_risk(wind, load) == expected


def test_highest_weather_risk_wins():
    assert checkpoint_risk(Weather(10, 0.3, 2.5), 10_000) == Risk.SEVERE
    assert checkpoint_risk(Weather(45, 0, 0), 30_001) == Risk.NO_TRAVEL
    assert checkpoint_risk(Weather(0, 0, 0), 1) == Risk.LOW


@pytest.mark.parametrize("value", [-1, float("nan"), float("inf")])
def test_invalid_weather_is_not_zero(value):
    with pytest.raises(ValueError):
        Weather(value, 0, 0)
