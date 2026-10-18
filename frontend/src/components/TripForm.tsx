import { useState } from "react";
import {
  defaultDeparture,
  toTrip,
  validateTrip,
  type FormValues,
} from "../api/validation";
import type { Trip } from "../types";
import { LocationField } from "./LocationField";
import { Icon } from "./Icon";

const intervalHelp = {
  10: "Highest detail; more weather samples.",
  25: "Balanced detail and performance.",
  50: "Fewer samples; faster analysis for long routes.",
};

export function TripForm({
  busy,
  mode,
  onSubmit,
  onEdit,
  onCancel,
}: {
  busy: boolean;
  mode: string;
  onSubmit: (trip: Trip) => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<FormValues>({
    origin: null,
    destination: null,
    departure: defaultDeparture(),
    load: "32000",
    interval: 25,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  function change<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    onEdit();
    setValues((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: "" }));
  }
  function example() {
    onEdit();
    setErrors({});
    setValues((previous) => ({
      ...previous,
      origin: { label: "Denver, Colorado, USA", point: [-104.9903, 39.7392] },
      destination: {
        label: "Salt Lake City, Utah, USA",
        point: [-111.891, 40.7608],
      },
      departure: defaultDeparture(),
    }));
  }
  return (
    <section className="planner-panel" aria-labelledby="planner-heading">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">YOUR NEXT JOURNEY</span>
          <h2 id="planner-heading">Plan your trip</h2>
        </div>
        <span className="icon-box">
          <Icon name="road" />
        </span>
      </div>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          const found = validateTrip(values);
          setErrors(found);
          if (!Object.keys(found).length) onSubmit(toTrip(values));
        }}
      >
        <div className="location-stack">
          <LocationField
            label="Origin"
            value={values.origin}
            onChange={(v) => change("origin", v)}
            error={errors.origin}
            placeholder="City, state or ZIP code"
          />
          <LocationField
            label="Destination"
            value={values.destination}
            onChange={(v) => change("destination", v)}
            error={errors.destination}
            placeholder="Where are you heading?"
          />
        </div>
        {mode === "demo" && (
          <button
            className="text-button demo-example"
            type="button"
            onClick={example}
          >
            Use Denver → Salt Lake City demo
          </button>
        )}
        <div className="field">
          <label htmlFor="departure">
            Departure <span>your local time</span>
          </label>
          <input
            id="departure"
            type="datetime-local"
            value={values.departure}
            aria-invalid={!!errors.departure}
            aria-describedby="departure-help"
            onChange={(e) => change("departure", e.target.value)}
          />
          <p
            id="departure-help"
            className={errors.departure ? "field-error" : "helper"}
          >
            {errors.departure || "Choose a departure within the next 48 hours."}
          </p>
        </div>
        <div className="field">
          <label htmlFor="load">Load weight</label>
          <div className="input-suffix">
            <input
              id="load"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={values.load}
              aria-invalid={!!errors.load}
              aria-describedby="load-help"
              onChange={(e) => change("load", e.target.value)}
            />
            <span>lb</span>
          </div>
          <p id="load-help" className={errors.load ? "field-error" : "helper"}>
            {errors.load || "Load weight can increase wind-related risk."}
          </p>
        </div>
        <fieldset className="interval-field">
          <legend>Checkpoint interval</legend>
          <div className="segmented-control">
            {([10, 25, 50] as const).map((value) => (
              <label
                key={value}
                className={values.interval === value ? "active" : ""}
              >
                <input
                  type="radio"
                  name="interval"
                  value={value}
                  checked={values.interval === value}
                  onChange={() => change("interval", value)}
                />
                <span>{value} miles</span>
              </label>
            ))}
          </div>
          <p className="helper">{intervalHelp[values.interval]}</p>
        </fieldset>
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? (
            <>
              <span className="spinner" /> Analyzing trip…
            </>
          ) : (
            <>
              Analyze routes <Icon name="arrow" size={18} />
            </>
          )}
        </button>
        {busy && (
          <button
            type="button"
            className="text-button cancel-button"
            onClick={onCancel}
          >
            Cancel analysis
          </button>
        )}
      </form>
      <div className="sampling-note">
        <Icon name="clock" size={18} />
        <p>
          Weather is sampled along the route using the estimated time your truck
          reaches each checkpoint.
        </p>
      </div>
      <details className="how-it-works">
        <summary>
          <Icon name="shield" size={17} /> How risk is calculated
        </summary>
        <p>
          Up to 3 alternatives are sampled at your estimated arrival times. The
          highest severity from wind, rain, and snow determines each
          checkpoint’s risk. Load weight can increase wind risk.
        </p>
        <p>
          No Travel violates the supplied safety rules. Fully assessed, eligible
          routes are compared by Severe miles, High miles, distance-weighted
          average risk, then travel time. Missing weather never counts as low
          risk.
        </p>
        <p>
          Shared rain/snow boundaries use the higher severity; exactly 1 in/h
          rain and 3 in/h snow remain Severe.
        </p>
      </details>
    </section>
  );
}
