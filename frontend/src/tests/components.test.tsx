import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Recommendation, RiskBadge } from "../components/RouteComparison";
import { ForecastSlider } from "../components/ForecastSlider";
import type { Analysis, Route } from "../types";

it("never labels an all-unsafe assessment as recommended", () => {
  const data = {
    recommendation: {
      status: "NO_SAFE_ROUTE",
      route_id: null,
      explanation: "Ranking is informational only.",
    },
  } as Analysis;
  render(<Recommendation data={data} />);
  expect(screen.getByRole("heading")).toHaveTextContent(
    "No currently safe route",
  );
  expect(screen.queryByText(/best eligible/)).not.toBeInTheDocument();
});

it("distinguishes unknown weather from low risk using text", () => {
  render(
    <>
      <RiskBadge risk={null} />
      <RiskBadge risk={0} />
    </>,
  );
  expect(screen.getByText("Weather unavailable")).toBeVisible();
  expect(screen.getByText("Low")).toBeVisible();
});

it("uses preloaded slider data and limits missing forecast hours", () => {
  const onChange = vi.fn();
  const route = {
    heatmap: {
      max_hour: 12,
      points: [{ point: [0, 0], risks: Array(13).fill(1) }],
    },
  } as Route;
  render(
    <ForecastSlider
      departure="2026-10-18T12:00:00Z"
      route={route}
      hour={0}
      onChange={onChange}
      visible
      onToggle={() => {}}
    />,
  );
  const slider = screen.getByRole("slider");
  expect(slider).toHaveAttribute("max", "12");
  fireEvent.change(slider, { target: { value: "8" } });
  expect(onChange).toHaveBeenCalledWith(8);
  expect(screen.getByText(/Forecast coverage ends at/)).toBeVisible();
});
