from math import isfinite

from planner.domain.models import Risk, Weather


def wind_risk(mph: float, load_lb: float) -> Risk:
    if mph >= 55 or (mph >= 45 and load_lb > 30_000):
        return Risk.NO_TRAVEL
    if mph >= 45 or (mph >= 35 and load_lb > 40_000):
        return Risk.SEVERE
    if mph >= 35:
        return Risk.HIGH
    if mph >= 25:
        return Risk.MODERATE
    return Risk.LOW


def rain_risk(inches: float) -> Risk:
    # Shared interior boundaries use the higher severity. Explicit >1 is preserved.
    if inches > 1:
        return Risk.NO_TRAVEL
    if inches >= 0.5:
        return Risk.SEVERE
    if inches >= 0.25:
        return Risk.HIGH
    if inches >= 0.1:
        return Risk.MODERATE
    return Risk.LOW


def snow_risk(inches: float) -> Risk:
    if inches > 3:
        return Risk.NO_TRAVEL
    if inches >= 2:
        return Risk.SEVERE
    if inches >= 1:
        return Risk.HIGH
    if inches >= 0.5:
        return Risk.MODERATE
    return Risk.LOW


def checkpoint_risk(weather: Weather, load_lb: float) -> Risk:
    if not isfinite(load_lb) or load_lb <= 0:
        raise ValueError("Load weight must be greater than 0 lb and finite.")
    return max(
        wind_risk(weather.wind_mph, load_lb), rain_risk(weather.rain_in), snow_risk(weather.snow_in)
    )


def risk_reason(weather: Weather, load_lb: float) -> str:
    if weather.wind_mph >= 55:
        return "Wind is at least 55 mph: No Travel for any load."
    if weather.wind_mph >= 45 and load_lb > 30_000:
        return "Wind is at least 45 mph with a load above 30,000 lb: No Travel."
    if weather.rain_in > 1:
        return "Rain exceeds 1 inch/hour: No Travel."
    if weather.snow_in > 3:
        return "Snow exceeds 3 inches/hour: No Travel."
    if 35 <= weather.wind_mph < 45 and load_lb > 40_000:
        return "Load above 40,000 lb raises wind risk to Severe."
    return "Highest applicable severity across wind, rain, and snow."
