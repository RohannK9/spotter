import type { Location, Trip } from "../types";

export interface FormValues {
  origin: Location | null;
  destination: Location | null;
  departure: string;
  load: string;
  interval: 10 | 25 | 50;
}
export function validateTrip(
  values: FormValues,
  now = Date.now(),
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.origin)
    errors.origin = "Find and select an origin, including city and state.";
  if (!values.destination)
    errors.destination =
      "Find and select a destination, including city and state.";
  if (
    values.origin &&
    values.destination &&
    (values.origin.label.toLowerCase() ===
      values.destination.label.toLowerCase() ||
      values.origin.point.every((v, i) => v === values.destination?.point[i]))
  )
    errors.destination = "Choose a different destination from the origin.";
  const departure = new Date(values.departure).getTime();
  if (!Number.isFinite(departure))
    errors.departure = "Choose a valid departure date and time.";
  else if (departure <= now)
    errors.departure = "Choose a departure time in the future.";
  else if (departure > now + 48 * 3600_000)
    errors.departure = "Departure must be within the next 48 hours.";
  if (!Number.isFinite(Number(values.load)) || Number(values.load) <= 0)
    errors.load = "Load weight must be greater than 0 lb.";
  if (![10, 25, 50].includes(values.interval))
    errors.interval = "Choose 10, 25, or 50 miles.";
  return errors;
}
export function toTrip(values: FormValues): Trip {
  if (!values.origin || !values.destination)
    throw new Error("Select both locations.");
  return {
    origin: values.origin,
    destination: values.destination,
    departure: new Date(values.departure).toISOString(),
    load_lb: Number(values.load),
    interval_miles: values.interval,
  };
}
export function defaultDeparture(): string {
  const date = new Date(Date.now() + 3600_000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
