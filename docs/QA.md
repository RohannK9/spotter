# QA evidence

Local verification date: 2026-10-17. This is execution evidence, not a hosted deployment claim.

## Executed

- Backend domain/API/provider suite: 78 passing tests in the final run. Covers exact wind/rain/snow boundaries; load thresholds; combined risk; No Travel and unknowns; distance-weighted intervals; ranking/ties/explanations; interpolation, duplicate vertices and antimeridian; UTC offsets/ETAs; API validation; provider retries; timeout; units; missing/malformed weather; cache reuse/stale/expired data; concurrent request deduplication/limits; malformed routes; total weather failure; corridor failure; safe internal errors; CORS and explicit geocoding matches.
- Frontend unit suite: 7 passing tests for validation, UTC serialization, unsafe/unknown rendering, forecast coverage limits, threshold-aware number formatting and stale-request cancellation.
- Live Open-Meteo smoke: two locations in one batch returned HTTP 200; correct `mp/h` and `inch` units; both had weather at departure and departure +48h, with no fallback notices.
- Django startup system check passed in demo mode; separate processes verified clear failure without the mandatory secret or live Google key.
- Three Chromium browser scenarios passed against both development and the production build: complete trip/route selection/checkpoint popups; rapid forecast-slider updates without an extra analysis request; invalid location/weight; explicit geocoding selection; cancellation; offline and retry feedback; fewer routes; incomplete weather; all routes unsafe; failed heatmap; retained results on provider/network error.
- Desktop (1280px) and mobile (390px) screenshots inspected. Confirmed route/marker/heatmap overlays, tiles, attribution and no horizontal page overflow. MapLibre's Vite worker integration was corrected after initial screenshot review caught missing overlays.
- Automated WCAG A/AA checks passed on the populated desktop screen; low-contrast helper text found in the first scan was fixed. Keyboard-accessible controls and non-color risk labels are included; this is not a comprehensive accessibility certification.
- Backend Ruff lint/format, frontend ESLint, TypeScript typecheck, production build, `pip check` and npm audit passed. Vite reports the expected large MapLibre chunk warning (~283 kB gzip plus worker); it is dynamically loaded.
- Reviewed the initial Git diff; whitespace check passed, `.env`/dependencies/build artifacts are ignored, and no provider keys or debug console calls were found in source. No commits or pushes.

## Docker and Google credential checks — 2026-10-18

- Built both root Dockerfile targets with Docker Compose on macOS/ARM64. Started both services with `docker compose up -d --wait`; backend and frontend reported healthy. Django system checks and Nginx configuration validation passed.
- Verified the frontend and proxied API at `http://localhost:8080`: health, location search with query parameters, missing static asset returning 404, and application-path fallback. Backend port is private; frontend binds to local port 8080.
- Chromium exercised the Docker-served demo: three routes, route selection, loaded MapLibre worker, checkpoint popup, and forecast slider without another analysis request. No page errors. Screenshot: ignored local `frontend/test-results/docker-desktop.png`.
- Backend image runs as a non-root user and contains neither the root `.env` nor the runtime Google key. Compose supplies credentials to the backend at runtime. Docker debug mode is disabled.
- Real Google Routes request returned three alternatives for Denver → Boulder. Google Geocoding returned `REQUEST_DENIED` with a message requiring billing to be enabled on the Google Cloud project. At that point the app remained in demo mode. This blocker was subsequently resolved; see the follow-up below.

## Live Docker follow-up — 2026-10-18

After the user enabled billing and recreated containers with live mode, both containers were healthy and `/api/health/` reported `live`. Chromium completed address selection for Denver, CO and Boulder, CO and submitted a real analysis through Nginx at port 8080. The response contained one recommended route, 100% checkpoint weather coverage and 48 hours of corridor forecasts. The slider moved to +24h without another analysis request; no page errors occurred. Screenshot: ignored local `frontend/test-results/docker-live.png`. This is a local live smoke check, not public deployment verification.

## Pending external verification

- Public frontend/backend deployment, deployed CORS, credentials, HTTPS, refresh/deep links and fresh-browser network/console inspection.
- Verify the approved Google Maps live-map implementation with Maps JavaScript API enabled and the hosted domain allowed.

## Operational limits to remember

600 checkpoints per analysis; up to 90 corridor points per route; up to 4 weather batches in flight per process; 20 coordinates per batch; 10-minute fresh weather cache / 30-minute labeled transient fallback; 1,500 cached entries. Request abort prevents stale UI updates, but synchronous backend work already started finishes independently. Map/forecast data is a planning aid and is not truck-certified navigation.

## Deployment preparation — 2026-10-18

- User approved Google Maps for live map display; synthetic demo mode retains MapLibre. Routes, checkpoint Data layer, InfoWindow popups and a canvas OverlayView preserve map interactions without the retired Google HeatmapLayer. Live map verification is pending: the browser returned `ApiNotActivatedMapError` for the new browser key.
- Single-service cloud Docker image built successfully. Verified frontend, API health, privacy/terms pages, missing asset/secret-path 404s and invalid-host rejection. Three browser scenarios passed against this image in explicit synthetic demo mode. Backend 78 tests, frontend 7 tests, TypeScript, ESLint and Ruff passed.
- Render Free blueprint prepared; public deployment pending. Railway project creation was rejected due to an expired trial and no Railway service was created.
- The live video recorder and timed narration generator are implemented. The first take stopped at the Google Maps authorization check; no completed video is claimed.
- User explicitly approved creation of a private RohannK9/spotter repository and the initial commit/push. Secret scan passed before repository publication; .env and generated recordings are ignored.
