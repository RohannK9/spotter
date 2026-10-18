import { describe, expect, it } from "vitest";
import { formatWeather } from "../types";
import { toTrip, validateTrip, type FormValues } from "../api/validation";

const now = new Date("2026-10-18T12:00:00Z").getTime();
const valid: FormValues = {
  origin: { label: "A", point: [0, 0] },
  destination: { label: "B", point: [1, 1] },
  departure: "2026-10-18T17:45:00+05:30",
  load: "32000",
  interval: 25,
};
describe("trip validation", () => {
  it("does not display rounded weather as if it crossed a risk boundary", () => {
    expect(formatWeather(34.999, "wind_mph")).toBe("<35.0");
    expect(formatWeather(35, "wind_mph")).toBe("35.0");
    expect(formatWeather(1.00001, "rain_in")).toBe(">1.000");
    expect(formatWeather(3.00001, "snow_in")).toBe(">3.000");
  });
  it("preserves timezone offsets when converting to UTC", () => {
    expect(validateTrip(valid, now)).toEqual({});
    expect(toTrip(valid).departure).toBe("2026-10-18T12:15:00.000Z");
  });
  it("rejects unknown/same locations, bad weight, and unsupported departures", () => {
    expect(
      validateTrip(
        { ...valid, origin: null, load: "0", departure: "invalid" },
        now,
      ),
    ).toHaveProperty("origin");
    expect(
      validateTrip({ ...valid, destination: valid.origin }, now),
    ).toHaveProperty("destination");
    expect(validateTrip({ ...valid, load: "Infinity" }, now)).toHaveProperty(
      "load",
    );
    expect(
      validateTrip({ ...valid, departure: "2026-10-17T12:00:00Z" }, now),
    ).toHaveProperty("departure");
    expect(
      validateTrip({ ...valid, departure: "2026-10-21T12:00:00Z" }, now),
    ).toHaveProperty("departure");
  });
});
