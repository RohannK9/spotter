import type { Analysis, Risk, Route } from "../types";
import {
  formatDuration,
  formatWeather,
  formatMiles,
  riskColors,
  riskLabel,
  routeColors,
} from "../types";
import { Icon } from "./Icon";

export function RiskBadge({ risk }: { risk: Risk | null }) {
  return (
    <span className={`risk-badge risk-${risk ?? "unknown"}`}>
      <i style={{ background: risk === null ? "#7c8490" : riskColors[risk] }} />
      {riskLabel(risk)}
    </span>
  );
}

export function RouteComparison({
  data,
  selected,
  onSelect,
}: {
  data: Analysis;
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="route-cards">
      {data.routes.map((route, index) => {
        const a = route.assessment;
        const recommended = data.recommendation.route_id === route.id;
        return (
          <button
            key={route.id}
            className={`route-card ${selected === route.id ? "selected" : ""}`}
            onClick={() => onSelect(route.id)}
            aria-pressed={selected === route.id}
            aria-label={`Select ${route.id}`}
          >
            <div className="route-card-heading">
              <span className="route-id">
                <i style={{ background: routeColors[index] }} />
                {route.id}
              </span>
              {recommended ? (
                <span className="recommend-tag">✓ Recommended</span>
              ) : a.blocked ? (
                <span className="blocked-tag">⚠ No Travel</span>
              ) : !a.complete ? (
                <span className="incomplete-tag">Incomplete</span>
              ) : (
                <span className="route-alternative">Alternative</span>
              )}
            </div>
            <p className="route-name">{route.name}</p>
            <div className="route-main-stat">
              <strong>{formatDuration(route.duration_seconds)}</strong>
              <span>{formatMiles(route.distance_miles)} mi</span>
            </div>
            <div className="route-risk-stats">
              <span>
                <b>{formatMiles(a.severe_miles)}</b>Severe mi
              </span>
              <span>
                <b>{formatMiles(a.high_miles)}</b>High mi
              </span>
              <span>
                <b>
                  {a.average_risk === null ? "—" : a.average_risk.toFixed(2)}
                </b>
                Avg / 4
              </span>
            </div>
            {!a.complete && (
              <p className="coverage-note">
                Risk assessment incomplete · {(a.coverage * 100).toFixed(0)}%
                mileage assessed. Averages cover known weather only.
              </p>
            )}
            {a.blocked && (
              <p className="blocked-note">
                No Travel detected · {formatMiles(a.no_travel_miles)} known
                affected mi
              </p>
            )}
            {!data.recommendation.route_id && (
              <p className="coverage-note">
                Informational rank{" "}
                {data.recommendation.ranking.indexOf(route.id) + 1} of{" "}
                {data.routes.length}
              </p>
            )}
            <span className="route-card-footer">
              {route.checkpoints.length} checkpoints{" "}
              <span>
                {selected === route.id ? "Viewing on map" : "View route →"}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Recommendation({ data }: { data: Analysis }) {
  const safe = data.recommendation.status === "RECOMMENDED";
  return (
    <div className={`recommendation ${safe ? "" : "warning"}`} role="status">
      <span className="recommendation-icon">
        <Icon name={safe ? "shield" : "warning"} size={26} />
      </span>
      <div>
        <span className="eyebrow">
          {safe ? "WEATHER-AWARE RECOMMENDATION" : "SAFETY ASSESSMENT"}
        </span>
        <h2>
          {safe
            ? `${data.recommendation.route_id} is the best eligible route`
            : data.recommendation.status === "NO_SAFE_ROUTE"
              ? "No currently safe route"
              : "Risk assessment incomplete"}
        </h2>
        <p>{data.recommendation.explanation}</p>
      </div>
      {safe && (
        <span className="recommendation-check" aria-hidden="true">
          ✓
        </span>
      )}
    </div>
  );
}

export function CheckpointDetails({
  route,
  selectedIndex,
  onSelect,
}: {
  route: Route;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}) {
  return (
    <section
      className="checkpoint-section"
      aria-labelledby="checkpoints-heading"
    >
      <div className="section-title">
        <div>
          <span className="eyebrow">ARRIVAL-TIME FORECAST</span>
          <h2 id="checkpoints-heading">{route.id} checkpoints</h2>
        </div>
        <span className="muted">{route.checkpoints.length} samples</span>
      </div>
      <p className="helper">
        {route.eta_method === "step_timing"
          ? "ETAs use step timing normalized to total travel time."
          : "ETAs use a distance-proportional travel-time estimate."}{" "}
        Rest stops are not included.
      </p>
      <div className="checkpoint-table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Checkpoint</th>
              <th scope="col">Estimated arrival</th>
              <th scope="col">Wind</th>
              <th scope="col">Rain</th>
              <th scope="col">Snow</th>
              <th scope="col">Risk</th>
            </tr>
          </thead>
          <tbody>
            {route.checkpoints.map((cp, index) => (
              <tr
                key={index}
                className={selectedIndex === index ? "selected-checkpoint" : ""}
              >
                <th scope="row">
                  <button
                    className="text-button"
                    onClick={() => onSelect(index)}
                  >
                    {index === 0
                      ? "Origin"
                      : index === route.checkpoints.length - 1
                        ? "Destination"
                        : `Mile ${formatMiles(cp.miles)}`}
                  </button>
                </th>
                <td>
                  {new Date(cp.eta).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZoneName: "short",
                  })}
                </td>
                <td>
                  {cp.weather
                    ? `${formatWeather(cp.weather.wind_mph, "wind_mph")} mph`
                    : "—"}
                </td>
                <td>
                  {cp.weather
                    ? `${formatWeather(cp.weather.rain_in, "rain_in")} in/h`
                    : "—"}
                </td>
                <td>
                  {cp.weather
                    ? `${formatWeather(cp.weather.snow_in, "snow_in")} in/h`
                    : "—"}
                </td>
                <td>
                  <RiskBadge risk={cp.risk} />
                  {cp.stale && <small>Cached fallback</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
