import { formatTime, type Route } from "../types";
import { Icon } from "./Icon";

export function ForecastSlider({
  departure,
  route,
  hour,
  onChange,
  visible,
  onToggle,
}: {
  departure: string;
  route: Route | undefined;
  hour: number;
  onChange: (value: number) => void;
  visible: boolean;
  onToggle: () => void;
}) {
  const max = route?.heatmap.max_hour ?? -1;
  const unavailable = max < 0;
  const known =
    route?.heatmap.points.filter((point) => point.risks[hour] !== null)
      .length ?? 0;
  return (
    <section className="forecast-panel" aria-labelledby="forecast-heading">
      <div className="forecast-heading">
        <div>
          <Icon name="layers" size={19} />
          <h3 id="forecast-heading">Corridor forecast</h3>
        </div>
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={visible}
            onChange={onToggle}
            disabled={unavailable}
          />
          <span>Weather layer</span>
        </label>
      </div>
      <p className="helper">
        Explore how forecast risk changes along the trip corridor over the next
        48 hours.
      </p>
      <div className="forecast-time">
        <strong>
          +{hour}h <span>from departure</span>
        </strong>
        <time>
          {formatTime(
            new Date(
              new Date(departure).getTime() + hour * 3600_000,
            ).toISOString(),
          )}
        </time>
      </div>
      <input
        aria-label="Forecast hours after departure"
        type="range"
        min="0"
        max={Math.max(0, max)}
        step="1"
        value={Math.min(hour, Math.max(0, max))}
        disabled={unavailable}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="slider-labels">
        <span>Departure</span>
        <span>+{Math.max(0, max) / 2}h</span>
        <span>+{Math.max(0, max)}h</span>
      </div>
      {unavailable ? (
        <p className="helper">
          {route
            ? "Weather corridor visualization is temporarily unavailable."
            : "Analyze a trip to explore its forecast."}
        </p>
      ) : (
        <p className="helper">
          {max < 48
            ? `Forecast coverage ends at +${max}h; later hours are unavailable. `
            : ""}
          {known}/{route?.heatmap.points.length} corridor samples available. The
          heatmap blends forecast severity; checkpoint risks use arrival times.
        </p>
      )}
    </section>
  );
}
