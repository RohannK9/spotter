# Spotter

Weather-aware route comparison for a truck driver: React/TypeScript + Django REST Framework, with Google Maps in live mode and MapLibre in synthetic demo mode. Compare up to three routes using checkpoint arrival-time forecasts and explore a preloaded 0–48-hour corridor heatmap.

## Run locally

Requires Python 3.12+ and Node 22.12+ (or Node 24/26). From the repository root:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt -e './backend[dev]'
npm ci --prefix frontend
cp .env.example .env
```

Set `DJANGO_SECRET_KEY` to a random value in `.env`. For live mode, enable Google **Routes API and Geocoding API**, configure billing, and put a restricted server-side key in `GOOGLE_ROUTES_API_KEY`. Open-Meteo needs no key for this noncommercial assessment. Never use a `VITE_` variable for server secrets. The live map separately requires `VITE_GOOGLE_MAPS_API_KEY`, an intentionally public browser key restricted to Maps JavaScript API and your website origins. See [deployment and key setup](docs/DEPLOYMENT.md).

For a credential-free review, explicitly set `PROVIDER_MODE=demo`. The UI and API label synthetic routes/weather; they are not road directions or live forecasts. The form offers a Denver → Salt Lake City example; other demo locations are Cheyenne and Kansas City. Live mode is the default in `.env.example`.

```sh
# Terminal 1, repository root
.venv/bin/python backend/manage.py runserver 127.0.0.1:8000
# Terminal 2, repository root
npm run dev --prefix frontend
```

Open **http://127.0.0.1:5173**. No migrations or database required. A local ignored `.env` may already be present in the development workspace; preserve it if configured.

## Run both services with Docker

Start Docker Desktop (or Docker Engine with Compose). Keep your existing root `.env`; if starting fresh, copy `.env.example` and configure the secret and provider settings above.

```sh
docker compose up --build -d --wait
```

Open **http://localhost:8080**. Compose starts Django with Gunicorn and serves the built React frontend with Nginx. Nginx forwards `/api/` to Django on the private container network, so no frontend API URL or extra CORS configuration is needed. Only port 8080 is published, on the local machine. Both containers have health checks; Django debug mode is disabled in Docker. No database or migrations are needed.

The root `Dockerfile` has separate backend and frontend targets. `.dockerignore` excludes `.env` and local dependencies from the build; Compose passes `.env` only to the backend at runtime. Do not put the server Routes key in a `VITE_` variable. Compose passes the separate public `VITE_GOOGLE_MAPS_API_KEY` as a frontend build argument. Set `APP_PORT` in `.env` to change the frontend port.

```sh
docker compose ps                 # Container health
docker compose logs --tail=100     # Application/startup logs
docker compose down               # Stop both services
```

After changing backend variables in `.env`, run `docker compose up -d --force-recreate --wait`. After changing the browser Maps key or code, rerun the build/start command. These containers serve a production build; use the local development commands above for hot reload.

For live data, set `PROVIDER_MODE=live` only after both Routes and Geocoding work with the configured key/project. `PROVIDER_MODE=demo` remains available for synthetic-data testing. A successful `/api/health/` response confirms application startup, not Google billing/API access.

## Architecture

- `backend/planner/domain/`: pure risk thresholds, great-circle geometry interpolation, cumulative-distance checkpoints, ETA timing, mileage aggregation, and lexicographic recommendation.
- `providers/`: Google routing/geocoding, Open-Meteo, and explicit demo fixtures; one shared timeout/retry/error-normalization client.
- `services/analysis.py`: sampling, bounded forecast fetching, partial failure handling, response assembly, timing logs.
- `api/`: authoritative validation, safe errors, request IDs, and endpoints. No authentication, trip persistence, or database.
- `frontend/src/`: accessible form, comparisons, checkpoint table, persistent Google Maps route/forecast overlays (MapLibre sources/layers in synthetic demo mode), request cancellation, and local forecast slider. The Google Maps SDK loads only in live mode; the demo map library and worker are separate bundles.

`GET /api/locations/?query=Denver,CO` returns labeled candidates for explicit selection. `POST /api/analyze/` accepts `origin` and `destination` objects (`label`, `point: [longitude, latitude]`), an offset-aware `departure`, positive `load_lb`, and `interval_miles` (10/25/50). `GET /api/health/` reports mode and startup health, not provider availability. Errors have `{error: {category, message, details, request_id}}`.

## Risk interpretation and assumptions

- Levels are LOW=0, MODERATE=1, HIGH=2, SEVERE=3, NO_TRAVEL=4. Wind boundaries are 25/35/45/55 mph; load overrides use strict `>30,000` and `>40,000` lb comparisons exactly as supplied.
- Overlapping rain/snow endpoints use the higher interior band: rain at 0.25/0.50 in/h is High/Severe; snow at 1/2 in/h is High/Severe. Exactly 1 in/h rain and 3 in/h snow remain Severe; only greater values are No Travel.
- A checkpoint uses maximum wind/rain/snow severity after load overrides. An interval inherits the higher endpoint severity. Miles and averages are distance-weighted; a final partial interval keeps its true length. The final destination is always sampled.
- Any No Travel checkpoint excludes that route. Any missing checkpoint excludes it from recommendations. Unknown intervals are unassessed, never Low. Partial averages describe known mileage only. Viable routes minimize `(severe miles, high miles, average risk, travel seconds)` with a stable ID tie-break. All-unsafe rankings are informational.
- Geometry distances are scaled to provider road distance. Step distance/static-duration knots distribute the traffic-aware total duration; otherwise ETA is distance-proportional. These are estimates, excluding stops and driver-hours rules.
- All internal times are UTC. Departure must be within the next 48 hours. Nearest hourly weather is selected at each ETA (30-minute ties go forward); missing/out-of-range hours stay unknown. Open-Meteo precipitation is the preceding hour's accumulation, interpreted as the hourly rate. Rain includes `rain + showers`; snowfall is snowfall depth, not water-equivalent precipitation.
- Corridor stations are at least 25 miles apart, capped at 30 per route, with samples 5 miles to each side. All 49 departure-relative hours are loaded once. A spatially blended heatmap is illustrative; exact checkpoint risk remains tied to ETA. Forecast hours with no corridor coverage disable the remaining slider range.

## Resilience and configuration

Provider calls use an 8-second read timeout, 3-second connect timeout, at most 3 attempts, exponential backoff and jitter for transient failures only. Weather batches contain up to 20 unique coordinates, with at most 4 in flight per process and a 65-second scheduling budget. Coordinates are deduplicated to 0.001°; cached forecasts are fresh for 10 minutes, with clearly labeled fallback up to 30 minutes on transient errors. Cache capacity is 1,500 entries. Identical concurrent batches share work. Routing is not cached because of provider policy restrictions.

At most 600 trip checkpoints are accepted per analysis; larger requests explain how to increase the interval or split the trip. Weather, malformed routes, or corridor failures preserve usable results. A browser abort cancels/ignores the response; an already-running synchronous backend request finishes within its bounded provider work. Requests are throttled to 20/minute per IP per process.

See `.env.example`: `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `PROVIDER_MODE`, `GOOGLE_ROUTES_API_KEY`, `PROVIDER_TIMEOUT_SECONDS`, `WEATHER_CACHE_SECONDS`, `WEATHER_STALE_SECONDS`. The frontend uses optional build-time `VITE_API_BASE_URL`; absent means same-origin `/api`. Missing mandatory live configuration fails at startup. Logs contain request IDs, counts, durations, and failure categories, not addresses or provider credentials.

## Checks

```sh
.venv/bin/pytest backend -q
.venv/bin/ruff check backend
.venv/bin/ruff format --check backend
npm run test --prefix frontend
npm run lint --prefix frontend
npm run typecheck --prefix frontend
npm run build --prefix frontend
cd frontend
npx playwright install chromium
npm run test:e2e
# Exercise the built frontend and bundled map worker:
E2E_PREVIEW=1 npm run test:e2e
```

Browser tests start their own demo servers unless servers already occupy ports 8000/5173. Stop development servers first when testing the production preview. See [QA evidence and remaining checks](docs/QA.md).

## Deployment and limitations

**Not publicly deployed.** Frontend URL: pending. Backend URL: pending. A live Docker browser smoke check passed using Google Geocoding, Google Routes and Open-Meteo after billing was enabled. Provider verification details are recorded in QA.

1. Deploy Django as a Python service: `pip install -r backend/requirements.txt ./backend`, then `gunicorn --chdir backend config.wsgi:application --bind 0.0.0.0:8000 --workers 2 --threads 4 --timeout 150` (use the host's port). Set a random secret, `DJANGO_DEBUG=false`, exact allowed backend hosts/frontend origins, and provider mode/key. Serve behind HTTPS and set provider quotas. No database service is needed.
2. Deploy `frontend/dist` to a static host after `npm ci --prefix frontend` and `npm run build --prefix frontend`, with `VITE_API_BASE_URL=https://<backend-host>` set **at build time**. Configure a fallback to `index.html` for application paths, preserving actual static asset/worker URLs and MIME types.
3. Verify from a fresh browser: both URLs, CORS, live provider responses, map overlays/tiles, worker loading, refresh, HTTPS, console/network errors, mobile layout, and slider behavior. Do not mark hosted QA complete until executed.

**Approved map change:** live mode now displays Google Routes results on Google Maps, following the user-approved change from the original MapLibre-only requirement and Google's [Routes display policy](https://developers.google.com/maps/documentation/routes/policies). MapLibre/OpenStreetMap remains available only for explicitly synthetic demo mode. Public privacy/terms pages are included. Google Maps browser-key and hosted verification are recorded separately in QA.

Routes are driving routes, not truck-certified routing: height/width, hazardous materials, closures, and legal driving limits are not evaluated. Weather is sampled and may miss hazards between checkpoints; the heatmap is not a radar or a safety guarantee. No wind gust, ice, or visibility rule was supplied. In-memory caches/throttles are process-local. The synthetic demo map needs WebGL2 and network tiles; its MapLibre bundle is sizeable. The live map needs a separately configured Google browser key and network access. Public-host verification remains pending.

Provider references: [Google Routes alternatives](https://developers.google.com/maps/documentation/routes/alternative-routes), [Google Geocoding](https://developers.google.com/maps/documentation/geocoding/requests-geocoding), [Open-Meteo hourly forecast](https://open-meteo.com/en/docs), [MapLibre worker setup](https://maplibre.org/maplibre-gl-js/docs/).

See [submission notes and an 8-minute Loom outline](docs/SUBMISSION.md). The user approved an initial private repository commit/push for deployment; see deployment notes for status.

For the single-service cloud image and hosting status, see [deployment](docs/DEPLOYMENT.md). For the browser recording and timed voiceover, see [demo video](docs/DEMO_VIDEO.md).
