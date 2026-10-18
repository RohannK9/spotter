METERS_PER_MILE = 1609.344
EARTH_RADIUS_METERS = 6_371_008.8


def meters_to_miles(value: float) -> float:
    return value / METERS_PER_MILE


def centimeters_to_inches(value: float) -> float:
    return value / 2.54


def millimeters_to_inches(value: float) -> float:
    return value / 25.4
