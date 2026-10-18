// Records real UI actions only. Requires a running, configured live application.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const baseURL = process.env.DEMO_URL || "http://localhost:8080";
const output = resolve("../artifacts/demo");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  recordVideo: { dir: output, size: { width: 1440, height: 1000 } },
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
const started = Date.now();
const chapters = [];
let analysisCount = 0;
const pageErrors = [];
page.on("request", (r) => {
  if (r.url().includes("/api/analyze/")) analysisCount++;
});
page.on("pageerror", (e) => pageErrors.push(e.name));
const pause = (ms) =>
  new Promise((resolvePause) => setTimeout(resolvePause, ms));
async function chapter(title, narration, seconds, action = async () => {}) {
  const start = (Date.now() - started) / 1000;
  console.log(`Recording: ${title}`);
  await action();
  await pause(
    Math.max(0, seconds * 1000 - (Date.now() - started - start * 1000)),
  );
  chapters.push({
    title,
    narration,
    start,
    end: (Date.now() - started) / 1000,
  });
}
let summary;
let completed = false;
try {
  const health = await context.request.get(`${baseURL}/api/health/`);
  expect((await health.json()).mode).toBe("live");
  await page.goto(baseURL);
  await expect(page.locator(".gm-style")).toBeVisible();
  await pause(4000);
  await expect(page.locator(".map-error")).toHaveCount(0);
  await chapter(
    "Introduction",
    "Spotter compares driving routes using weather forecasts at estimated checkpoint arrival times. This recording uses live Google routing and location search, Google Maps, and Open-Meteo forecasts. It is a planning demonstration, not truck-certified navigation. The interface keeps route recommendations, forecast exploration and checkpoint details together.",
    30,
  );
  await chapter(
    "Choose the trip",
    "I search for Denver, Colorado and Salt Lake City, Utah, and explicitly select the matching locations. Selecting a result confirms its coordinates before analysis. Departure is in the next hour, the load is 32,000 pounds, and checkpoints are 25 miles apart. The interval balances detail and response time; longer trips can use wider spacing.",
    40,
    async () => {
      for (const [label, query] of [
        ["Origin", "Denver, CO"],
        ["Destination", "Salt Lake City, UT"],
      ]) {
        await page
          .getByLabel(label, { exact: true })
          .pressSequentially(query, { delay: 90 });
        await page
          .getByRole("button", {
            name: `Find ${label.toLowerCase()}`,
            exact: true,
          })
          .click();
        const choice = page
          .locator(`[aria-label="Select ${label.toLowerCase()}"] button`)
          .first();
        await expect(choice).toBeVisible();
        await pause(1500);
        await choice.click();
      }
    },
  );
  await chapter(
    "Analyze live data",
    "The backend requests available route alternatives, samples their geometry and estimates arrival times. It then fetches weather in bounded batches. Wind, rain and snow contribute to each checkpoint risk, with the supplied load-weight rules applied on the server. Missing weather remains unknown rather than being treated as safe.",
    35,
    async () => {
      const responsePromise = page.waitForResponse(
        (r) => r.url().includes("/api/analyze/"),
        { timeout: 125000 },
      );
      await page
        .getByRole("button", { name: "Analyze routes", exact: true })
        .click();
      const response = await responsePromise;
      expect(response.ok()).toBe(true);
      const result = await response.json();
      summary = {
        mode: result.mode,
        routes: result.routes.length,
        recommendation: result.recommendation.status,
        coverage: result.routes.map((r) => r.assessment.coverage),
        heatmapHours: result.routes.map((r) => r.heatmap.max_hour),
        notices: result.notices,
      };
      await expect(
        page.getByRole("heading", { name: "Compare your routes" }),
      ).toBeVisible();
    },
  );
  await chapter(
    "Compare alternatives",
    "These are the alternatives returned for this request; Google can return fewer than three. Any No Travel checkpoint excludes a route from recommendation, and incomplete checkpoint weather also prevents eligibility. Among eligible routes, the comparison minimizes severe-risk miles, then high-risk miles, average risk and travel duration. I can select an alternative without fetching the trip again.",
    35,
    async () => {
      const routes = page.getByRole("button", { name: /^Select Route/ });
      if ((await routes.count()) > 1) await routes.nth(1).click();
      await page.locator(".map-shell").scrollIntoViewIfNeeded();
      await pause(5000);
      await page
        .getByRole("heading", { name: "Compare your routes" })
        .scrollIntoViewIfNeeded();
    },
  );
  await chapter(
    "Inspect a checkpoint",
    "Each checkpoint exposes its estimated arrival time, forecast measurements and the reason for its risk category. The map popup and table use the same backend result. Mileage statistics are distance-weighted, including the final partial interval. These arrival-time conditions are distinct from the corridor forecast slider shown next.",
    35,
    async () => {
      const checkpoint = page.getByRole("button", {
        name: "Mile 25",
        exact: true,
      });
      await checkpoint.click();
      await page.locator(".map-shell").scrollIntoViewIfNeeded();
      await expect(page.locator(".checkpoint-popup")).toBeVisible();
      await pause(10000);
      await page.getByRole("button", { name: "Close", exact: true }).click();
    },
  );
  await chapter(
    "Explore the forecast",
    "The forecast slider explores the selected route corridor over the available next 48 hours. It updates preloaded weather locally, so scrubbing does not make another analysis request. The colored overlay illustrates forecast severity, while checkpoint risk remains tied to estimated arrival. Turning the weather layer off makes the route geometry easier to inspect.",
    40,
    async () => {
      await page.getByRole("slider").scrollIntoViewIfNeeded();
      const slider = page.getByRole("slider");
      const max = Number(await slider.getAttribute("max"));
      for (const hour of [12, 24, 36, 48, 0]) {
        await slider.fill(String(Math.min(hour, max)));
        await pause(4000);
      }
      await page.getByLabel("Weather layer").uncheck();
      await pause(3000);
      await page.getByLabel("Weather layer").check();
      expect(analysisCount).toBe(1);
    },
  );
  await chapter(
    "Validation and offline guidance",
    "The form validates inputs before making provider requests. A zero load is rejected with a specific correction. The application also detects an offline browser and explains the connection problem. Inputs remain available for correction and retry. Provider timeouts, bounded retries, partial responses and labeled stale weather fallbacks are handled on the backend.",
    35,
    async () => {
      await page.getByLabel("Load weight").fill("0");
      await page
        .getByRole("button", { name: "Analyze routes", exact: true })
        .click();
      await expect(
        page.getByText("Load weight must be greater than 0 lb."),
      ).toBeVisible();
      await pause(6000);
      await page.getByLabel("Load weight").fill("32000");
      await context.setOffline(true);
      await expect(page.getByText(/You appear to be offline/)).toBeVisible();
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "smooth" }),
      );
      await pause(6000);
      await context.setOffline(false);
    },
  );
  await chapter(
    "Architecture and conclusion",
    "The frontend is React and TypeScript. Django owns validation, provider access, weather-risk calculations and route ranking. Google Routes credentials remain on the server; the map uses a separate website-restricted browser key. The cloud image serves the frontend and API from one origin through Gunicorn and WhiteNoise. Automated tests cover the domain rules, provider failures and browser flows. The recording demonstrates a real live request; weather sampling and ETA estimates still have limitations, and drivers must verify official road conditions.",
    40,
    async () => {
      await page
        .getByRole("heading", { name: "Compare your routes" })
        .scrollIntoViewIfNeeded();
      await pause(8000);
      await page.locator(".map-shell").scrollIntoViewIfNeeded();
    },
  );
  expect(pageErrors).toEqual([]);
  await expect(page.locator(".map-error")).toHaveCount(0);
  await page.screenshot({
    path: resolve(output, "final-frame.png"),
    fullPage: true,
  });
  completed = true;
} finally {
  const video = page.video();
  await context.close();
  await video.saveAs(
    resolve(
      output,
      completed ? "spotter-live.webm" : "incomplete-recording.webm",
    ),
  );
  await browser.close();
}
if (completed) {
  const stamp = (seconds) =>
    new Date(Math.round(seconds * 1000))
      .toISOString()
      .slice(11, 23)
      .replace(".", ",");
  const srt = chapters
    .map(
      (c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.title}\n`,
    )
    .join("\n");
  await writeFile(resolve(output, "chapters.srt"), srt);
  await writeFile(
    resolve(output, "narration.md"),
    `# Spotter live demo narration\n\nRecorded from ${baseURL}. Silent browser footage; read this script as voiceover.\n\n` +
      chapters
        .map(
          (c) =>
            `## ${stamp(c.start).slice(0, 8)} — ${c.title}\n\n${c.narration}\n`,
        )
        .join("\n"),
  );
  await writeFile(
    resolve(output, "verification.json"),
    JSON.stringify(
      {
        url: baseURL,
        recordedAt: new Date().toISOString(),
        ...summary,
        analysisCount,
        pageErrors,
        chapters,
      },
      null,
      2,
    ),
  );
  const converted = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      resolve(output, "spotter-live.webm"),
      "-i",
      resolve(output, "chapters.srt"),
      "-map",
      "0:v:0",
      "-map",
      "1:0",
      "-c:v",
      "libx264",
      "-crf",
      "21",
      "-preset",
      "fast",
      "-pix_fmt",
      "yuv420p",
      "-c:s",
      "mov_text",
      "-movflags",
      "+faststart",
      resolve(output, "spotter-live.mp4"),
    ],
    { stdio: "inherit" },
  );
  if (converted.status !== 0)
    throw new Error(
      "Video conversion failed; the WebM recording is available.",
    );
  console.log(`Saved video and narration to ${output}`);
}
