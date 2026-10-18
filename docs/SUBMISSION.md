# Submission notes

## What was implemented

- React/TypeScript/Vite frontend and Django REST API, without a database.
- Server-only Google Routes/Geocoding integrations; Open-Meteo hourly wind, rain, showers, and snowfall.
- Proper interpolated checkpoints, step-aware/fallback ETAs, exact tested thresholds and load overrides, distance-weighted aggregation, hard No Travel exclusion, deterministic lexicographic ranking and explanation.
- Three alternatives when available; partial-route/provider failure handling and conservative unknown-weather behavior.
- Google Maps live route/forecast overlays and MapLibre synthetic demo layers, map selection, checkpoint popups/table, recommendation cards, and a preloaded 49-hour corridor heatmap.
- Frontend cancellation, offline and retry UX, validation, explicit location confirmation, risk/interval/forecast help, responsive layouts and error boundaries.
- Backend retries, bounded concurrency, weather cache/deduplication, labeled stale fallback, safe errors, request IDs and timing logs.
- Explicit synthetic demo mode, setup/environment documentation, automated tests, and deployment instructions.

## Files to review

Start with `backend/planner/domain/risk.py`, `sampling.py`, and `recommendation.py`; then `services/analysis.py`, the three live provider modules and their shared `http.py`. Read `api/serializers.py` for the input contract. Frontend flow starts in `src/App.tsx`; map lifecycle/source updates live in `components/TripMap.tsx`. Tests are in `backend/tests`, `frontend/src/tests`, and `frontend/e2e`. Configuration is in `.env.example`, `backend/config`, and the frontend build/lint/test configs.

## Initial source publication

1. `feat: add tested weather risk, sampling and route recommendation domain`
2. `feat: integrate route and weather providers with resilient analysis API`
3. `feat: add responsive route planner and arrival-time checkpoint map`
4. `feat: preload corridor forecasts and add interactive forecast slider`
5. `test: verify failure states, accessibility and browser flows; document setup`

The user approved an initial commit and push to a private RohannK9/spotter repository for Render deployment. The items above describe logical areas of the implementation. Deployment and video verification status is tracked in QA.

## Eight-minute Loom outline

| Time | Demonstration / explanation |
|---|---|
| 0:00–0:45 | Problem, stack, 16-hour constraint; identify live versus clearly labeled demo data. |
| 0:45–2:00 | Enter/resolve locations, set departure/load/interval, analyze, and explain the recommendation. |
| 2:00–3:00 | Compare all alternatives, select routes, inspect checkpoint ETA/weather, and show No Travel exclusion. |
| 3:00–3:45 | Move the forecast slider; show relative/actual times and network panel proving no weather refetch. |
| 3:45–4:45 | Walk through threshold boundaries, conservative endpoint mileage, missing-weather eligibility, and tuple ranking. |
| 4:45–5:45 | Show provider boundaries, timeout/retry policy, batching/cache/stale labels, UTC and unit handling. |
| 5:45–6:30 | Demonstrate input validation, cancellation, offline/retry states, and mobile layout. |
| 6:30–7:15 | Run tests/typecheck/build and summarize the verified failures and browser coverage. |
| 7:15–8:00 | Show the single-command Docker setup; explain the approved Google Maps live-map change, completed local live API smoke check, pending hosted verification, and truck-routing/ETA limitations. |

Be ready to defend: shared precipitation boundary choices; why missing weather prevents recommendation; why an unsafe fastest route loses; why adjacent endpoint maximums determine interval risk; and why slider time differs from checkpoint ETA.
