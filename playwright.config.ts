import { defineConfig, devices } from "@playwright/test";

/** Browser journey against a production build with its own isolated data store. */
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
    // Turbopack's build worker cannot bind its internal local port in the managed executor.
    // Webpack exercises the same production routes without that environment-only restriction.
    command: "npx next build --webpack && npx next start -p 3200",
    url: "http://localhost:3200/deals/hero",
    timeout: 300_000,
    reuseExistingServer: false,
    env: { ADAPTIVE_DEALS_DATA_DIR: ".data-e2e", GROQ_API_KEY: "", ANTHROPIC_API_KEY: "", RAZORPAY_MODE: "simulated" },
  },
});
