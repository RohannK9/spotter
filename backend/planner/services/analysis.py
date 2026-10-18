import logging
import time
from dataclasses import asdict
from datetime import UTC, datetime, timedelta

from django.conf import settings

from planner.api.errors import ApplicationError
from planner.domain.models import Point
from planner.domain.recommendation import aggregate, recommend
from planner.domain.risk import checkpoint_risk, risk_reason
from planner.domain.sampling import corridor_points, sample_route
from planner.domain.units import meters_to_miles
from planner.providers import demo, google_routes, open_meteo

logger = logging.getLogger("planner")


def analyze(trip: dict, request_id: str) -> dict:
    departure = trip["departure"].astimezone(UTC)
    load = trip["load_lb"]
    routing = demo if settings.PROVIDER_MODE == "demo" else google_routes
    weather = demo if settings.PROVIDER_MODE == "demo" else open_meteo
    start = time.monotonic()
    routes, notices = routing.get_routes(
        Point(*trip["origin"]["point"]), Point(*trip["destination"]["point"]), departure, request_id
    )
    routing_ms = round((time.monotonic() - start) * 1000)
    start = time.monotonic()
    # Operational payload/latency bound, not a truck-weight or route-length business rule.
    estimated_count = sum(
        int(meters_to_miles(r.distance_meters) / trip["interval_miles"]) + 2 for r in routes
    )
    if estimated_count > 600:
        raise ApplicationError(
            "This trip exceeds the 600-checkpoint analysis limit. Choose a "
            "larger checkpoint interval or split the trip into shorter legs.",
            "validation_error",
            400,
        )
    sampled, corridors, valid_routes = {}, {}, []
    for route in routes:
        try:
            sampled[route.id] = sample_route(route, trip["interval_miles"], departure)
            valid_routes.append(route)
        except ValueError:
            notices.append(f"{route.id} could not be sampled because its geometry was invalid.")
            continue
        try:
            corridors[route.id] = corridor_points(route, departure)
        except ValueError:
            corridors[route.id] = []
    if not valid_routes:
        raise ApplicationError(
            "The returned routes could not be analyzed. Try another trip.",
            "malformed_provider_response",
            502,
        )
    sampling_ms = round((time.monotonic() - start) * 1000)
    points = [cp.point for r in valid_routes for cp in sampled[r.id]]
    points += [p for r in valid_routes for p in corridors[r.id]]
    end = max(
        departure + timedelta(hours=49),
        max(sampled[r.id][-1].eta for r in valid_routes) + timedelta(hours=1),
    )
    # Open-Meteo's maximum horizon is 16 days. Longer ETAs remain explicitly unavailable.
    end = min(end, datetime.now(UTC) + timedelta(days=15))
    start = time.monotonic()
    try:
        forecasts, weather_notices = weather.fetch_forecasts(
            points, departure - timedelta(hours=1), end, request_id
        )
    except ApplicationError as exc:
        logger.warning(
            "weather_unavailable", extra={"request_id": request_id, "category": exc.category}
        )
        forecasts, weather_notices = {}, []
    weather_ms = round((time.monotonic() - start) * 1000)
    notices.extend(weather_notices)
    output, assessments = [], []
    any_weather = False
    for route in valid_routes:
        checkpoints, risks = [], []
        for cp in sampled[route.id]:
            forecast = forecasts.get(open_meteo.point_key(cp.point))
            value = forecast.at(cp.eta) if forecast else None
            risk = checkpoint_risk(value, load) if value else None
            any_weather = any_weather or value is not None
            risks.append(risk)
            checkpoints.append(
                {
                    "point": cp.point.coordinates(),
                    "miles": cp.miles,
                    "eta": cp.eta.isoformat(),
                    "weather": asdict(value) if value else None,
                    "risk": int(risk) if risk is not None else None,
                    "status": risk.name if risk is not None else "WEATHER_UNAVAILABLE",
                    "reason": risk_reason(value, load)
                    if value
                    else "Weather data is unavailable for this checkpoint.",
                    "fetched_at": forecast.fetched_at if forecast else None,
                    "stale": forecast.stale if forecast else False,
                }
            )
        assessment = aggregate(route.id, sampled[route.id], risks, route.duration_seconds)
        assessments.append(assessment)
        heatmap = []
        for point in corridors[route.id]:
            forecast = forecasts.get(open_meteo.point_key(point))
            values = []
            for hour in range(49):
                value = forecast.at(departure + timedelta(hours=hour)) if forecast else None
                values.append(int(checkpoint_risk(value, load)) if value else None)
            heatmap.append({"point": point.coordinates(), "risks": values})
        available_hours = [any(p["risks"][h] is not None for p in heatmap) for h in range(49)]
        max_hour = -1
        for h, available in enumerate(available_hours):
            if not available:
                break
            max_hour = h
        if max_hour < 48:
            notices.append(
                f"{route.id}: Weather corridor visualization "
                + (
                    "is temporarily unavailable."
                    if max_hour < 0
                    else f"is only available through +{max_hour}h."
                )
            )
        output.append(
            {
                "id": route.id,
                "name": route.name,
                "geometry": [p.coordinates() for p in route.geometry],
                "distance_miles": meters_to_miles(route.distance_meters),
                "duration_seconds": route.duration_seconds,
                "eta_method": "step_timing" if route.timing else "distance_proportional",
                "checkpoints": checkpoints,
                "assessment": asdict(assessment),
                "heatmap": {"points": heatmap, "max_hour": max_hour},
            }
        )
    if not any_weather:
        notices.append(
            "Routes were found, but current weather data could not be retrieved. "
            "Safety recommendations are temporarily unavailable."
        )
    logger.info(
        "analysis_complete",
        extra={
            "request_id": request_id,
            "route_count": len(output),
            "checkpoint_count": sum(len(r["checkpoints"]) for r in output),
            "sampling_ms": sampling_ms,
            "weather_ms": weather_ms,
            "routing_ms": routing_ms,
        },
    )
    return {
        "request_id": request_id,
        "mode": settings.PROVIDER_MODE,
        "departure": departure.isoformat(),
        "origin": trip["origin"],
        "destination": trip["destination"],
        "load_lb": load,
        "interval_miles": trip["interval_miles"],
        "routes": output,
        "recommendation": recommend(assessments),
        "notices": list(dict.fromkeys(notices)),
    }
