import { useEffect, useRef, useState } from "react";
import { findLocations } from "../api/client";
import type { Location } from "../types";

export function LocationField({
  label,
  value,
  onChange,
  error,
  placeholder,
}: {
  label: string;
  value: Location | null;
  onChange: (value: Location | null) => void;
  error?: string;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Location[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [providerMode, setProviderMode] = useState("");
  const active = useRef<AbortController | null>(null);
  const id = label.toLowerCase();
  useEffect(() => () => active.current?.abort(), []);
  async function search() {
    active.current?.abort();
    if (query.trim().length < 2) {
      setMessage("Enter at least two characters, including a city and state.");
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setMessage("");
    setResults([]);
    try {
      const data = await findLocations(query, controller.signal);
      if (controller.signal.aborted) return;
      setResults(data.results);
      setProviderMode(data.mode);
      if (!data.results.length)
        setMessage(
          data.mode === "demo"
            ? "Demo locations: Denver, Salt Lake City, Cheyenne, or Kansas City."
            : "We couldn't find that location. Try including the city, state, or ZIP/postal code.",
        );
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(
          error instanceof Error
            ? error.message
            : "Location search failed. Please try again.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="field location-field">
      <label htmlFor={id}>{label}</label>
      <div className={`location-input ${value ? "resolved" : ""}`}>
        <span className={`location-dot ${id}`} aria-hidden="true" />
        <input
          id={id}
          value={value?.label ?? query}
          placeholder={placeholder}
          autoComplete="off"
          aria-invalid={!!error}
          aria-describedby={`${id}-help`}
          onChange={(e) => {
            active.current?.abort();
            setBusy(false);
            setQuery(e.target.value);
            onChange(null);
            setResults([]);
            setMessage("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !value) {
              e.preventDefault();
              void search();
            }
          }}
        />
        {!value && (
          <button
            type="button"
            className="find-button"
            aria-label={`Find ${id}`}
            disabled={busy}
            onClick={() => void search()}
          >
            {busy ? "…" : "Find"}
          </button>
        )}
        {value && (
          <span className="resolved-check" aria-label="Location selected">
            ✓
          </span>
        )}
      </div>
      <div id={`${id}-help`}>
        {(error || message) && (
          <p className="field-error" role="alert">
            {error || message}
          </p>
        )}
        {results.length > 0 && (
          <div className="location-results" aria-label={`Select ${id}`}>
            <p>
              Choose your {id}
              {results.some((r) => r.partial_match)
                ? " — check partial matches carefully"
                : ""}
              :
            </p>
            {results.map((result, index) => (
              <button
                type="button"
                key={result.id ?? index}
                onClick={() => {
                  onChange(result);
                  setQuery(result.label);
                  setResults([]);
                  setMessage("");
                }}
              >
                {result.label}
                {result.partial_match && (
                  <small>Partial match — verify this location</small>
                )}
              </button>
            ))}
            {providerMode === "live" && (
              <small className="google-attribution" translate="no">
                Google Maps
              </small>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
