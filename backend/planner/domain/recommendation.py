from planner.domain.models import Assessment, Checkpoint, Risk


def aggregate(
    route_id: str, checkpoints: list[Checkpoint], risks: list[Risk | None], duration_seconds: float
) -> Assessment:
    if len(checkpoints) != len(risks) or len(checkpoints) < 2:
        raise ValueError("Each route needs at least two matching checkpoints and risks.")
    mileage = {risk: 0.0 for risk in Risk}
    unknown = 0.0
    for index in range(1, len(checkpoints)):
        miles = checkpoints[index].miles - checkpoints[index - 1].miles
        if miles < 0:
            raise ValueError("Checkpoint distances must be nondecreasing.")
        left, right = risks[index - 1], risks[index]
        if left is None or right is None:
            unknown += miles
        else:
            mileage[max(left, right)] += miles
    assessed = sum(mileage.values())
    total = assessed + unknown
    if total <= 0:
        raise ValueError("A route must have positive distance.")
    return Assessment(
        route_id,
        mileage[Risk.SEVERE],
        mileage[Risk.HIGH],
        mileage[Risk.NO_TRAVEL],
        unknown,
        sum(int(risk) * miles for risk, miles in mileage.items()) / assessed if assessed else None,
        assessed / total,
        Risk.NO_TRAVEL in risks,
        all(r is not None for r in risks),
        duration_seconds,
    )


def rank_key(route: Assessment) -> tuple[float, ...]:
    return (
        route.severe_miles,
        route.high_miles,
        route.average_risk if route.average_risk is not None else float("inf"),
        route.duration_seconds,
    )


def recommend(routes: list[Assessment]) -> dict:
    viable = sorted((r for r in routes if r.viable), key=lambda r: (*rank_key(r), r.route_id))
    # Ineligible routes are explicitly informational and never compete with eligible routes.
    others = sorted(
        (r for r in routes if not r.viable),
        key=lambda r: (not r.complete, *rank_key(r), r.route_id),
    )
    ranked = [r.route_id for r in viable + others]
    if not viable:
        all_blocked = bool(routes) and all(r.blocked for r in routes)
        return {
            "route_id": None,
            "ranking": ranked,
            "status": "NO_SAFE_ROUTE" if all_blocked else "INCOMPLETE",
            "explanation": (
                "No route currently satisfies the safety criteria. Review the weather "
                "conditions or choose another departure time. Ranking is informational only."
                if all_blocked
                else "Risk assessment incomplete. No fully assessed route "
                "satisfies the safety criteria; a safety recommendation is unavailable."
            ),
        }
    best = viable[0]
    if len(viable) == 1:
        explanation = "Only fully assessed route without No Travel conditions."
    else:
        second = viable[1]

        def difference(value: float) -> str:
            return "<0.1" if 0 < value < 0.05 else f"{value:.1f}"

        explanations = [
            f"{difference(second.severe_miles - best.severe_miles)} fewer Severe-risk miles",
            "Equal Severe mileage; "
            f"{difference(second.high_miles - best.high_miles)} fewer High-risk miles",
            "Equal Severe and High mileage; lower distance-weighted average risk",
            "Equal weather risk; shorter travel time",
        ]
        explanation = "Equal risk and travel time; stable route order breaks the tie."
        for index, (a, b) in enumerate(zip(rank_key(best), rank_key(second), strict=True)):
            if a != b:
                explanation = f"{explanations[index]} than {second.route_id}."
                break
    return {
        "route_id": best.route_id,
        "ranking": ranked,
        "status": "RECOMMENDED",
        "explanation": explanation,
    }
