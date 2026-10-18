# Deploy Spotter

## Hosting package

`docker/Dockerfile.web` builds a single non-root service containing the Vite frontend and Django API. Gunicorn handles requests; WhiteNoise serves only `frontend/dist`. The app binds to `PORT` (default 8000). No database, persistent disk or separate frontend host is required. `railway.json` sets the Dockerfile, `/api/health/` startup check and bounded restart policy. Local two-container Compose remains supported.

Current target: Render free web service. Not publicly deployed yet. Railway authentication was verified, but project creation was rejected because the account's trial expired; the user chose Render instead. No Railway project or paid service was created.

## Render launch (selected provider)

`render.yaml` defines one free Docker web service in Oregon, a generated Django secret, one Gunicorn worker with four threads, port 10000, a health check, and manual deployments. It requests the two Google keys through Render's environment configuration. There is no database or paid compute plan in this blueprint.

1. The user approved the initial commit and push to a new private `RohannK9/spotter` GitHub repository.
2. Connect Render to that repository (grant access only to this repository if using a GitHub App).
3. Create a Blueprint from `render.yaml`, or a **Web Service** with language **Docker**, Dockerfile path `docker/Dockerfile.web`, build context `.`, and instance type **Free**.
4. Set the private Routes/Geocoding key and separate public Maps JavaScript browser key as requested by the blueprint. Do not paste keys into chat or source. The Dockerfile declares only the public browser key as a build argument; the server key remains runtime-only.
5. Add the assigned `https://<service>.onrender.com/*` URL to the browser key's website restrictions. Django automatically allows the exact `RENDER_EXTERNAL_HOSTNAME` supplied by Render. Add any custom hostname explicitly through `DJANGO_ALLOWED_HOSTS`.
6. Deploy and verify the HTTPS root, `/api/health/`, address search, a live trip, Google map/attribution, overlays/popups, slider, mobile layout and policy pages. Update QA with the actual URL only after these checks.

Render's [free web services](https://render.com/docs/free) spin down after inactivity and can take time to wake. Open the demo before recording/interviewing. Free hosting does not make Google API usage free; existing Google project quotas still apply. Render's [Docker guide](https://render.com/docs/docker) explains builds and environment variables.

## Browser and server credentials

Live mode uses Google Maps for map display. Synthetic demo mode uses MapLibre and OpenStreetMap. This is the user-approved change from the original MapLibre-only requirement, to address Google's standard [Routes map-display policy](https://developers.google.com/maps/documentation/routes/policies).

Use two separate Google keys in the same billed project:

- `GOOGLE_ROUTES_API_KEY`: server-only. Enable and restrict to Routes API and Geocoding API. Store only as a backend runtime variable. Any IP restrictions must permit the hosting service's outbound IPs.
- `VITE_GOOGLE_MAPS_API_KEY`: intentionally public browser key, restricted to Maps JavaScript API and exact permitted websites. Enable Maps JavaScript API. Include `http://localhost:8080/*` and `http://127.0.0.1:8080/*` for local Docker use. Add `https://<assigned-hostname>/*` before hosted verification. This value is baked into the frontend; changing it requires rebuilding, not just restarting.

Do not reuse the server key as the browser key. Secrets remain excluded from Git, Docker build contexts and frontend source. Railway reads the public key as a Docker build argument because it is explicitly declared with `ARG`; the server key has no build argument.

Local Compose after saving the browser key:

```sh
docker compose up --build -d --wait
```

## Railway alternative (not selected)

These are deployment steps, not a claim they have run. Account/plan activation is handled by the user. Existing instructions prohibit commits and pushes without explicit approval; Railway CLI upload does not require either.

1. Run `railway login` and finish account sign-in.
2. From the repository root, create the project with `railway init --name spotter`, then add an empty service with `railway add --service spotter-web`.
3. Add the following service variables in Railway's Variables panel. Keep the server key out of chat, shell command arguments and logs.

| Variable | Value |
|---|---|
| `DJANGO_SECRET_KEY` | A new random deployment secret |
| `DJANGO_DEBUG` | `false` |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1,healthcheck.railway.app` |
| `PROVIDER_MODE` | `live` |
| `GOOGLE_ROUTES_API_KEY` | Server Routes/Geocoding key |
| `VITE_GOOGLE_MAPS_API_KEY` | Separate browser Maps JavaScript key |
| `PORT` | `8000` |

The app adds Railway's `RAILWAY_PUBLIC_DOMAIN` to allowed hosts automatically. For a custom domain, explicitly add that hostname to `DJANGO_ALLOWED_HOSTS`. Keep `VITE_API_BASE_URL` unset: the frontend calls the same-origin `/api`. The existing provider/cache defaults apply.

4. Generate a domain with `railway domain --service spotter-web --port 8000`. Add that exact HTTPS origin to the browser key's website restrictions.
5. Upload with `railway up --service spotter-web --detach`. Keep Git ignore handling enabled; never use `--no-gitignore`.
6. Inspect status/logs. Verify the public HTTPS root and `/api/health/`, then geocoding, a real trip, Google attribution, route selection, checkpoint popup, forecast overlay/slider, refresh, and mobile layout. Check `/privacy.html` and `/terms.html`. Record the actual URL and results in QA only after verification.

Before sharing, review the privacy/terms pages against the actual deployment, preserve attribution, and set appropriate Google quotas. The backend's request throttle/cache are process-local, not a global spending limit.

## Local cloud-image verification

The public browser key must be passed as a build argument for live map checks. A credential-free image can be tested in explicit demo mode:

```sh
docker build -f docker/Dockerfile.web -t spotter-web .
docker run --rm --name spotter-web-check -p 127.0.0.1:8081:8000 \
  -e PROVIDER_MODE=demo -e DJANGO_SECRET_KEY=local-test-only spotter-web
# In another terminal:
cd frontend
E2E_BASE_URL=http://127.0.0.1:8081 npm run test:e2e
```

The root app is a single page without client-side routes. Static files and policy pages have real URLs; missing assets and unknown API paths return 404.

## Stop or roll back

Local: `docker compose down`. Hosted: suspend/delete the Render service when the assessment ends; if using Railway instead, stop/remove its deployment to stop runtime usage. Keep the prior successful deployment available for rollback according to the provider's retention window. Never share `.env` or an unredacted environment dump when troubleshooting.
