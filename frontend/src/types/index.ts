export type Coordinates = [number, number];
export type Risk = 0 | 1 | 2 | 3 | 4;
export interface Location {
  id?: string;
  label: string;
  point: Coordinates;
  partial_match?: boolean;
}
export interface Trip {
  origin: Location;
  destination: Location;
  departure: string;
  load_lb: number;
  interval_miles: 10 | 25 | 50;
}
export interface Weather {
  wind_mph: number;
  rain_in: number;
  snow_in: number;
}
export interface Checkpoint {
  point: Coordinates;
  miles: number;
  eta: string;
  weather: Weather | null;
  risk: Risk | null;
  status: string;
  reason: string;
  fetched_at: string | null;
  stale: boolean;
}
export interface Assessment {
  route_id: string;
  severe_miles: number;
  high_miles: number;
  no_travel_miles: number;
  unknown_miles: number;
  average_risk: number | null;
  coverage: number;
  blocked: boolean;
  complete: boolean;
  duration_seconds: number;
}
export interface Route {
  id: string;
  name: string;
  geometry: Coordinates[];
  distance_miles: number;
  duration_seconds: number;
  eta_method: "step_timing" | "distance_proportional";
  checkpoints: Checkpoint[];
  assessment: Assessment;
  heatmap: {
    points: { point: Coordinates; risks: (Risk | null)[] }[];
    max_hour: number;
  };
}
export interface Analysis {
  request_id: string;
  mode: "live" | "demo";
  departure: string;
  origin: Location;
  destination: Location;
  load_lb: number;
  interval_miles: number;
  routes: Route[];
  notices: string[];
  recommendation: {
    route_id: string | null;
    ranking: string[];
    status: "RECOMMENDED" | "NO_SAFE_ROUTE" | "INCOMPLETE";
    explanation: string;
  };
}

export const riskLabels = [
  "Low",
  "Moderate",
  "High",
  "Severe",
  "No Travel",
] as const;
export const riskColors = [
  "#31836a",
  "#b68a19",
  "#de782f",
  "#c94046",
  "#711d43",
] as const;
export const routeColors = ["#22766a", "#7060b4", "#347bb5"];
// Display-only precision: never round a value across a risk boundary without saying so.
// All risk decisions still come from the backend.
export function formatWeather(value: number, field: keyof Weather): string {
  const digits = field === "wind_mph" ? 1 : 3;
  const boundaries =
    field === "wind_mph"
      ? [25, 35, 45, 55]
      : field === "rain_in"
        ? [0.1, 0.25, 0.5, 1]
        : [0.5, 1, 2, 3];
  const rounded = Number(value.toFixed(digits));
  const prefix =
    rounded !== value && boundaries.includes(rounded)
      ? value < rounded
        ? "<"
        : ">"
      : "";
  return prefix + value.toFixed(digits);
}
export function riskLabel(risk: Risk | null) {
  return risk === null ? "Weather unavailable" : riskLabels[risk];
}
export function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}
export function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
export function formatMiles(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
