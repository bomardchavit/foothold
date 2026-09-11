import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: process.env.E2E_NO_SERVER ? undefined : { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000, env: { LLM_MODE: "heuristic", DEV_LOGIN: "true", DISABLE_SCHEDULER: "true" } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
