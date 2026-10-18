import { defineConfig } from "@playwright/test";
const externalURL = process.env.E2E_BASE_URL;
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: externalURL || "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: "list",
  webServer: externalURL
    ? undefined
    : [
        {
          command:
            "../.venv/bin/python ../backend/manage.py runserver 127.0.0.1:8000 --noreload",
          url: "http://127.0.0.1:8000/api/health/",
          reuseExistingServer: !process.env.CI,
          env: {
            PROVIDER_MODE: "demo",
            DJANGO_DEBUG: "true",
            DJANGO_SECRET_KEY: "local-browser-test-only",
            DJANGO_ALLOWED_HOSTS: "localhost,127.0.0.1",
          },
        },
        {
          command: process.env.E2E_PREVIEW
            ? "npm run preview -- --port 5173"
            : "npm run dev",
          url: "http://127.0.0.1:5173",
          reuseExistingServer: !process.env.CI,
        },
      ],
});
