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

- Long-running availability, load testing and comprehensive manual accessibility review are outside the completed smoke checks.
- Free-tier cold-start behavior has not been measured. This single-page app has no client-side deep-link routes.

## Operational limits to remember

600 checkpoints per analysis; up to 90 corridor points per route; up to 4 weather batches in flight per process; 20 coordinates per batch; 10-minute fresh weather cache / 30-minute labeled transient fallback; 1,500 cached entries. Request abort prevents stale UI updates, but synchronous backend work already started finishes independently. Map/forecast data is a planning aid and is not truck-certified navigation.

## Deployment preparation — 2026-10-18

- User approved Google Maps for live map display; synthetic demo mode retains MapLibre. Routes, checkpoint Data layer, InfoWindow popups and a canvas OverlayView preserve map interactions without the retired Google HeatmapLayer. Live map verification is pending: the browser returned `ApiNotActivatedMapError` for the new browser key.
- Single-service cloud Docker image built successfully. Verified frontend, API health, privacy/terms pages, missing asset/secret-path 404s and invalid-host rejection. Three browser scenarios passed against this image in explicit synthetic demo mode. Backend 78 tests, frontend 7 tests, TypeScript, ESLint and Ruff passed.
- Render Free blueprint prepared; public deployment pending. Railway project creation was rejected due to an expired trial and no Railway service was created.
- The live video recorder and timed narration generator are implemented. The first take stopped at the Google Maps authorization check; no completed video is claimed.
- User explicitly approved creation of a private RohannK9/spotter repository and the initial commit/push. Secret scan passed before repository publication; .env and generated recordings are ignored.

## Render deployment — 2026-10-18

- Public URL: https://spotter-toz3.onrender.com (frontend and API share one service). HTTPS root, live health endpoint, privacy and terms pages returned HTTP 200.
- Hosted Google location searches for Denver and Salt Lake City succeeded. A real analysis returned three alternatives, a recommendation, 100% checkpoint coverage on every route, 48-hour corridor forecasts and no fallback notices.
- Initial hosted Google Maps check returned `RefererNotAllowedMapError`; the user subsequently added the exact Render origin to the browser key restrictions. A fresh-browser recheck passed after the restriction update propagated. Google Maps loaded without API errors. Live route selection, checkpoint popup open/close and +24h forecast changes passed with no page errors. Desktop and 390px mobile screenshots were inspected; no horizontal page overflow was found. The hosted recording completed successfully; see the final evidence below.

## Completed hosted demo recording — 2026-10-18

- Recorded the actual https://spotter-toz3.onrender.com UI with live Google location search, routing and Google Maps plus Open-Meteo weather. The recorded Denver → Salt Lake City trip returned three routes, a recommendation, 100% checkpoint weather coverage, 48-hour corridor forecasts on all routes and no fallback notices.
- Verified route selection, checkpoint InfoWindow, weather-layer toggle and slider movement through the available 48 hours. Exactly one analysis request occurred throughout the walkthrough; page errors were empty. Zero-weight validation and an explicitly simulated offline connection were demonstrated, then connectivity restored.
- Export: `artifacts/demo/spotter-live.mp4`, H.264, 1440×1000, 307.84 seconds, approximately 8.6 MB, chapter subtitle track, no audio track. Matching timed voiceover script: `artifacts/demo/narration.md`. Generated media remains local and Git-ignored.
- Reviewed extracted video frames showing route comparison, the checkpoint popup, forecast controls and visible Google attribution. Desktop/mobile screenshots from the hosted browser smoke check were also inspected.
- Public service and recording are complete; free-tier cold-start behavior, load testing and comprehensive accessibility auditing remain outside this smoke verification.
