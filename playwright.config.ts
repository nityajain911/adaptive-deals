import { defineConfig, devices } from "@playwright/test";

/** Smoke test of the five-view journey against a production build with its own data store. */
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3200", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx next build && npx next start -p 3200",
    url: "http://localhost:3200/workspace",
    timeout: 300_000,
    reuseExistingServer: false,
    env: { ADAPTIVE_DEALS_DATA_DIR: ".data-e2e", ANTHROPIC_API_KEY: "", RAZORPAY_MODE: "simulated" },
  },
});
