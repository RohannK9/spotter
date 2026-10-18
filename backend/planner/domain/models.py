from dataclasses import dataclass
from datetime import datetime
from enum import IntEnum
from math import isfinite


class Risk(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4


@dataclass(frozen=True)
class Point:
    lng: float
    lat: float

    def __post_init__(self) -> None:
        if not (isfinite(self.lng) and isfinite(self.lat)):
            raise ValueError("Coordinates must be finite.")
        if not (-180 <= self.lng <= 180 and -90 <= self.lat <= 90):
            raise ValueError("Coordinates are outside the supported range.")

    def coordinates(self) -> list[float]:
        return [self.lng, self.lat]


@dataclass(frozen=True)
class Weather:
    wind_mph: float
    rain_in: float
    snow_in: float

    def __post_init__(self) -> None:
        if any(not isfinite(v) or v < 0 for v in (self.wind_mph, self.rain_in, self.snow_in)):
            raise ValueError("Weather values must be finite and nonnegative.")


@dataclass(frozen=True)
class Route:
    id: str
    name: str
    geometry: tuple[Point, ...]
    distance_meters: float
    duration_seconds: float
    # Cumulative (distance fraction, duration fraction), from Google step timings.
    timing: tuple[tuple[float, float], ...] = ()

    def __post_init__(self) -> None:
        if len(self.geometry) < 2:
            raise ValueError("A route requires at least two coordinates.")
        if any(not isfinite(v) or v <= 0 for v in (self.distance_meters, self.duration_seconds)):
            raise ValueError("Route distance and duration must be positive and finite.")


@dataclass(frozen=True)
class Checkpoint:
    point: Point
    miles: float
    eta: datetime


@dataclass(frozen=True)
class Assessment:
    route_id: str
    severe_miles: float
    high_miles: float
    no_travel_miles: float
    unknown_miles: float
    average_risk: float | None
    coverage: float
    blocked: bool
    complete: bool
    duration_seconds: float

    @property
    def viable(self) -> bool:
        return self.complete and not self.blocked
