from django.conf import settings

from planner.api.errors import ApplicationError, malformed
from planner.domain.models import Point
from planner.providers.http import request_json


def validate_status(data: dict) -> None:
    if not isinstance(data, dict) or "status" not in data:
        raise malformed("Geocoding")
    status = data["status"]
    if status in {"OK", "ZERO_RESULTS"}:
        return
    if status in {"OVER_QUERY_LIMIT", "UNKNOWN_ERROR"}:
        raise ApplicationError(
            "Location search is temporarily unavailable. Try again shortly.",
            "rate_limited" if status == "OVER_QUERY_LIMIT" else "provider_unavailable",
            503,
            "Geocoding",
            True,
        )
    raise ApplicationError(
        "Location search could not accept the request. Check the address or "
        "contact the operator to verify the geocoding configuration.",
        "provider_rejected_request",
        502,
        "Geocoding",
    )


def search_locations(query: str, request_id: str) -> list[dict]:
    data = request_json(
        "Geocoding",
        "GET",
        "https://maps.googleapis.com/maps/api/geocode/json",
        params={"address": query, "key": settings.GOOGLE_ROUTES_API_KEY},
        validate=validate_status,
        request_id=request_id,
    )
    try:
        results = []
        for row in data["results"][:5]:
            point = Point(
                float(row["geometry"]["location"]["lng"]), float(row["geometry"]["location"]["lat"])
            )
            results.append(
                {
                    "id": row["place_id"],
                    "label": row["formatted_address"],
                    "point": point.coordinates(),
                    "partial_match": row.get("partial_match", False),
                }
            )
        return results
    except (KeyError, TypeError, ValueError, IndexError):
        raise malformed("Geocoding") from None
