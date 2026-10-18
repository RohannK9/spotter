import type { Analysis, Location, Trip } from "../types";

const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
export class ApiError extends Error {
  constructor(
    message: string,
    public reference?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 120_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  try {
    const response = await fetch(`${base}${path}`, { ...options, signal });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new ApiError(
        "The service returned an unexpected response. Please try again.",
      );
    }
    if (!response.ok)
      throw new ApiError(
        data.error?.message ?? "The service is unavailable. Please try again.",
        data.error?.request_id,
        data.error?.details,
      );
    return data as T;
  } catch (error) {
    if (options.signal?.aborted)
      throw new DOMException("Request canceled", "AbortError");
    if (controller.signal.aborted)
      throw new ApiError(
        "Analysis took too long. Try a larger checkpoint interval or retry shortly.",
      );
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      navigator.onLine
        ? "We could not reach the service. Check your connection and try again."
        : "You appear to be offline. Check your connection and try again.",
    );
  } finally {
    window.clearTimeout(timer);
  }
}

export function analyzeTrip(trip: Trip, signal: AbortSignal) {
  return request<Analysis>("/api/analyze/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(trip),
    signal,
  });
}
export function findLocations(query: string, signal: AbortSignal) {
  return request<{ results: Location[]; mode: "live" | "demo" }>(
    `/api/locations/?query=${encodeURIComponent(query)}`,
    { signal },
  );
}
export function fieldMessages(details: unknown): string[] {
  if (Array.isArray(details)) return details.flatMap(fieldMessages);
  if (details && typeof details === "object")
    return Object.values(details).flatMap(fieldMessages);
  return typeof details === "string" ? [details] : [];
}
