import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { analyzeTrip, ApiError, fieldMessages, request } from "./api/client";
import type { Analysis, Trip } from "./types";
import { formatTime } from "./types";
import { TripForm } from "./components/TripForm";
import {
  CheckpointDetails,
  Recommendation,
  RouteComparison,
} from "./components/RouteComparison";
import { ForecastSlider } from "./components/ForecastSlider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Icon } from "./components/Icon";

const TripMap = lazy(() => import("./components/TripMap"));
const GoogleTripMap = lazy(() => import("./components/GoogleTripMap"));

export default function App() {
  const [mode, setMode] = useState("");
  const [data, setData] = useState<Analysis | null>(null);
  const ActiveTripMap =
    (data?.mode ?? mode) === "demo" ? TripMap : GoogleTripMap;
  const [selected, setSelected] = useState("");
  const [checkpointIndex, setCheckpointIndex] = useState<number | null>(null);
  const [hour, setHour] = useState(0);
  const [heatVisible, setHeatVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const [lastTrip, setLastTrip] = useState<Trip | null>(null);
  const active = useRef<AbortController | null>(null);
  const version = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    void request<{ mode: string }>("/api/health/", {
      signal: controller.signal,
    })
      .then((value) => setMode(value.mode))
      .catch(() => {});
    const online = () => setOffline(!navigator.onLine);
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    return () => {
      controller.abort();
      active.current?.abort();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
    };
  }, []);
  function cancel(edited = false) {
    const pending = active.current !== null;
    version.current += 1;
    active.current?.abort();
    active.current = null;
    setBusy(false);
    if (edited) {
      setDirty(true);
      setError(null);
      setLastTrip(null);
    }
    if (pending)
      setNotice(
        edited
          ? "Inputs changed. Previous analysis canceled; analyze again when ready."
          : "Analysis canceled. Your trip inputs have been preserved.",
      );
  }
  async function submit(trip: Trip) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const requestVersion = ++version.current;
    setBusy(true);
    setError(null);
    setNotice("");
    setLastTrip(trip);
    try {
      const result = await analyzeTrip(trip, controller.signal);
      if (requestVersion !== version.current || controller.signal.aborted)
        return;
      setData(result);
      setMode(result.mode);
      setDirty(false);
      setSelected(result.recommendation.route_id ?? result.routes[0]?.id ?? "");
      setHour(0);
      setCheckpointIndex(null);
    } catch (failure) {
      if (requestVersion === version.current && !controller.signal.aborted)
        setError(
          failure instanceof ApiError
            ? failure
            : new ApiError("Analysis failed. Please try again."),
        );
    } finally {
      if (requestVersion === version.current) {
        setBusy(false);
        active.current = null;
      }
    }
  }
  const selectRoute = useCallback((id: string) => {
    setSelected(id);
    setCheckpointIndex(null);
    setHour(0);
  }, []);
  const route = data?.routes.find((r) => r.id === selected);
  const boundedHour = Math.min(hour, Math.max(0, route?.heatmap.max_hour ?? 0));
  return (
    <>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Spotter home">
          <span className="brand-mark">
            <Icon name="road" size={25} />
          </span>
          spotter<span className="brand-period">.</span>
        </a>
        <span className="header-divider" />
        <span className="header-description">A clearer road ahead.</span>
        <span className="header-right">
          <span className="live-dot" />
          {mode === "demo" ? "Demo workspace" : "Weather-aware planning"}
        </span>
      </header>
      <main>
        <div className="page-intro">
          <div>
            <span className="eyebrow">KNOW WHAT’S AHEAD</span>
            <h1>Every mile. Better informed.</h1>
            <p>
              Compare routes by weather risk, load weight, and the time you’ll
              arrive.
            </p>
          </div>
          <span className="intro-badge">
            <Icon name="shield" size={20} /> Safety before speed
          </span>
        </div>
        {mode === "demo" && (
          <div className="demo-banner" role="status">
            <strong>DEMO MODE</strong>
            <span>
              Synthetic routes and weather for review only. Do not use for
              travel.
            </span>
          </div>
        )}
        {offline && (
          <div className="alert error" role="alert">
            You appear to be offline. Check your connection and try again.
            Previously loaded forecasts remain available.
          </div>
        )}
        <div className="workspace">
          <aside>
            <TripForm
              busy={busy}
              mode={mode}
              onSubmit={(trip) => void submit(trip)}
              onEdit={() => cancel(true)}
              onCancel={() => cancel()}
            />
            <div className="sidebar-footnote">
              <Icon name="shield" size={17} />
              <p>
                A weather planning aid. Verify road restrictions, conditions,
                and rest requirements before departure.
              </p>
            </div>
          </aside>
          <div className="results-area">
            {busy && (
              <div className="alert loading" role="status">
                <span className="spinner" />
                <div>
                  <strong>Analyzing routes and arrival-time weather…</strong>
                  <p>
                    Finding alternatives, checking forecasts, and preparing your
                    comparison. This may take a moment.
                  </p>
                </div>
              </div>
            )}
            {notice && (
              <div className="alert" role="status">
                {notice}
              </div>
            )}
            {error && (
              <div className="alert error" role="alert">
                <div>
                  <strong>{error.message}</strong>
                  {fieldMessages(error.details).map((message, i) => (
                    <p key={i}>{message}</p>
                  ))}
                  {error.reference && (
                    <small>Reference: {error.reference}</small>
                  )}
                </div>
                {lastTrip && (
                  <button
                    className="secondary-button"
                    onClick={() => void submit(lastTrip)}
                    disabled={busy}
                  >
                    Try again
                  </button>
                )}
              </div>
            )}
            {data && dirty && (
              <div className="alert" role="status">
                Showing your previous trip. Analyze again to apply changed
                inputs.
              </div>
            )}
            {data ? (
              <>
                <div className="trip-context">
                  <span>
                    {data.origin.label} <b>→</b> {data.destination.label}
                  </span>
                  <small>
                    {formatTime(data.departure)} ·{" "}
                    {data.load_lb.toLocaleString()} lb
                  </small>
                </div>
                <Recommendation data={data} />
                {data.notices
                  .filter((n) => !n.startsWith("DEMO:"))
                  .map((notice) => (
                    <div className="alert" role="status" key={notice}>
                      {notice}
                    </div>
                  ))}
                <div className="section-title">
                  <h2>Compare your routes</h2>
                  <span className="muted">Select a route to explore</span>
                </div>
                <ErrorBoundary label="route comparisons">
                  <RouteComparison
                    data={data}
                    selected={selected}
                    onSelect={selectRoute}
                  />
                </ErrorBoundary>
              </>
            ) : (
              <div className="empty-intro">
                <span className="icon-box">
                  <Icon name="wind" size={24} />
                </span>
                <div>
                  <h2>Your next route starts here</h2>
                  <p>
                    Enter your trip details to compare weather-aware routes.
                  </p>
                </div>
                <span className="step-count">01 — 03</span>
              </div>
            )}
            <section
              className="map-panel"
              aria-label="Route map and weather forecast"
            >
              <ErrorBoundary label="the map">
                <Suspense
                  fallback={
                    <div className="map-placeholder" role="status">
                      Loading map…
                    </div>
                  }
                >
                  <ActiveTripMap
                    data={data}
                    selected={selected}
                    hour={boundedHour}
                    heatVisible={heatVisible}
                    checkpointIndex={checkpointIndex}
                    onSelect={selectRoute}
                    onCheckpoint={setCheckpointIndex}
                  />
                </Suspense>
              </ErrorBoundary>
              {data ? (
                <ForecastSlider
                  departure={data.departure}
                  route={route}
                  hour={boundedHour}
                  onChange={setHour}
                  visible={heatVisible}
                  onToggle={() => setHeatVisible((v) => !v)}
                />
              ) : (
                <div className="map-empty-footer">
                  <Icon name="layers" />
                  <div>
                    <strong>A forecast for the whole journey</strong>
                    <p>
                      Explore the next 48 hours along your route, without losing
                      sight of arrival-time conditions.
                    </p>
                  </div>
                </div>
              )}
            </section>
            {route && (
              <ErrorBoundary label="checkpoint details">
                <CheckpointDetails
                  route={route}
                  selectedIndex={checkpointIndex}
                  onSelect={setCheckpointIndex}
                />
              </ErrorBoundary>
            )}
            <footer className="results-footer">
              <span>Plan with context. Drive with care.</span>
              <span>
                {mode === "demo"
                  ? "Synthetic demonstration data"
                  : "Routing: Google Maps · Weather: Open-Meteo"}
              </span>
              <span>
                <a href="/privacy.html">Privacy</a> ·{" "}
                <a href="/terms.html">Terms</a>
              </span>
            </footer>
          </div>
        </div>
      </main>
    </>
  );
}
