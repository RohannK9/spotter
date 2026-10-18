import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Analysis } from "../src/types";

test("complete demo trip, route interactions, slider without refetch, and mobile layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let analyses = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/analyze/")) analyses++;
  });
  const workerLoaded = page.waitForResponse(
    (response) =>
      response.url().includes("maplibre-gl-worker") && response.ok(),
  );
  await page.goto("/");
  await workerLoaded;
  await expect(page.getByText("DEMO MODE", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Use Denver → Salt Lake City demo" })
    .click();
  await page.getByRole("button", { name: "Analyze routes" }).click();
  await expect(
    page.getByRole("heading", { name: "Compare your routes" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Select Route/ })).toHaveCount(
    3,
  );
  await expect(
    page.getByRole("heading", { name: /best eligible route/ }),
  ).toBeVisible();
  await expect(page.locator(".map-error")).toHaveCount(0);
  await page.getByRole("button", { name: "Select Route B" }).click();
  await expect(
    page.getByRole("heading", { name: "Route B checkpoints" }),
  ).toBeVisible();
  const slider = page.getByRole("slider");
  await slider.fill("48");
  await slider.fill("12");
  await slider.fill("36");
  await expect(page.getByText("+36h", { exact: false }).first()).toBeVisible();
  expect(analyses).toBe(1);
  await page.getByRole("button", { name: "Mile 25", exact: true }).click();
  await expect(page.locator(".checkpoint-popup")).toBeVisible();
  await page.locator(".maplibregl-popup-close-button").click();
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    accessibility.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Analyze routes" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("validation, location search, offline feedback, and cancellation preserve inputs", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Analyze routes" }).click();
  await expect(
    page.getByText("Find and select an origin, including city and state."),
  ).toBeVisible();
  await page.getByLabel("Origin", { exact: true }).fill("not-a-city");
  await page.getByRole("button", { name: "Find origin" }).click();
  await expect(page.getByText(/Demo locations:/)).toBeVisible();
  await page.getByLabel("Origin", { exact: true }).fill("Denver");
  await page.getByRole("button", { name: "Find origin" }).click();
  await page
    .getByRole("button", { name: "Denver, Colorado, USA", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use Denver → Salt Lake City demo" })
    .click();
  await page.getByLabel("Load weight").fill("0");
  await page.getByRole("button", { name: "Analyze routes" }).click();
  await expect(
    page.getByText("Load weight must be greater than 0 lb."),
  ).toBeVisible();
  await page.getByLabel("Load weight").fill("32000");
  await page.route("**/api/analyze/", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.abort();
  });
  await page.getByRole("button", { name: "Analyze routes" }).click();
  await page.getByRole("button", { name: "Cancel analysis" }).click();
  await expect(
    page.getByText(/Analysis canceled. Your trip inputs/),
  ).toBeVisible();
  await expect(page.getByLabel("Load weight")).toHaveValue("32000");
  await context.setOffline(true);
  await expect(page.getByText(/You appear to be offline/)).toBeVisible();
  await context.setOffline(false);
});

test("partial weather, No Travel, fewer routes, failed heatmap, and retry states", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/analyze/", {
    data: {
      origin: { label: "Denver", point: [-104.9903, 39.7392] },
      destination: { label: "Salt Lake City", point: [-111.891, 40.7608] },
      departure: new Date(Date.now() + 3600_000).toISOString(),
      load_lb: 32000,
      interval_miles: 25,
    },
  });
  expect(response.ok()).toBe(true);
  const baseline = (await response.json()) as Analysis;
  let scenario: "unknown" | "unsafe" | "partial" | "timeout" | "offline" =
    "unknown";
  await page.route("**/api/analyze/", async (route) => {
    if (scenario === "offline") {
      await route.abort("connectionrefused");
      return;
    }
    if (scenario === "timeout") {
      await route.fulfill({
        status: 504,
        json: {
          error: {
            message: "Routing took too long to respond. Please try again.",
            request_id: "test-reference",
          },
        },
      });
      return;
    }
    const data = structuredClone(baseline);
    if (scenario === "unknown") {
      data.recommendation = {
        route_id: null,
        status: "INCOMPLETE",
        ranking: data.routes.map((r) => r.id),
        explanation: "Safety recommendations are temporarily unavailable.",
      };
      for (const r of data.routes) {
        r.assessment = {
          ...r.assessment,
          complete: false,
          blocked: false,
          coverage: 0,
          average_risk: null,
          unknown_miles: r.distance_miles,
        };
        r.heatmap = { max_hour: -1, points: [] };
        for (const cp of r.checkpoints) {
          cp.risk = null;
          cp.weather = null;
          cp.status = "WEATHER_UNAVAILABLE";
        }
      }
    } else if (scenario === "unsafe") {
      data.recommendation = {
        route_id: null,
        status: "NO_SAFE_ROUTE",
        ranking: data.routes.map((r) => r.id),
        explanation: "Ranking is informational only.",
      };
      for (const r of data.routes) r.assessment.blocked = true;
    } else {
      data.routes = data.routes.slice(0, 2);
      data.routes[0].heatmap = { points: [], max_hour: -1 };
      data.recommendation.route_id = data.routes[0].id;
      data.notices = [
        "Only 2 route alternatives were available for this trip.",
        "Weather corridor visualization is temporarily unavailable.",
      ];
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Use Denver → Salt Lake City demo" })
    .click();
  const analyze = page.getByRole("button", { name: "Analyze routes" });
  await analyze.click();
  await expect(
    page.getByRole("heading", { name: "Risk assessment incomplete" }),
  ).toBeVisible();
  await expect(page.getByRole("slider")).toBeDisabled();
  await expect(
    page.getByText("Weather unavailable", { exact: true }).first(),
  ).toBeVisible();
  scenario = "unsafe";
  await analyze.click();
  await expect(
    page.getByRole("heading", { name: "No currently safe route" }),
  ).toBeVisible();
  await expect(page.getByText("Informational rank 1 of 3")).toBeVisible();
  await expect(page.getByText("✓ Recommended", { exact: true })).toHaveCount(0);
  scenario = "partial";
  await analyze.click();
  await expect(page.getByRole("button", { name: /^Select Route/ })).toHaveCount(
    2,
  );
  await expect(page.getByRole("slider")).toBeDisabled();
  await expect(
    page.getByText("Only 2 route alternatives were available for this trip."),
  ).toBeVisible();
  scenario = "timeout";
  await analyze.click();
  await expect(page.getByText("Reference: test-reference")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Select Route/ })).toHaveCount(
    2,
  );
  scenario = "offline";
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText(/We could not reach the service/)).toBeVisible();
  await expect(page.getByLabel("Origin", { exact: true })).toHaveValue(
    "Denver, Colorado, USA",
  );
});
