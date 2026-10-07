import { defineConfig, devices } from "@playwright/test";

/**
 * Browser journeys against production builds with their own isolated data stores.
 *
 * Two servers share one build. The "sample" server (3200) is pinned to the labelled hand-written
 * sample, so the historical journeys assert exactly that run. The "recorded" server (3201) has no
 * override and loads the committed Groq recordings, as the ordinary product does.
 */
const NO_KEYS = { GROQ_API_KEY: "", ANTHROPIC_API_KEY: "", RAZORPAY_MODE: "simulated" };

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  projects: [
    { name: "sample", testMatch: ["journey.spec.ts", "walkthrough.spec.ts", "economics.spec.ts"], use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3200" } },
    { name: "recorded", testMatch: ["recorded.spec.ts"], use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3201" } },
  ],
  webServer: [
    {
      // Default remains the production Turbopack build. The explicit fallback is for restricted
      // runners that forbid the local port Turbopack's PostCSS worker opens during compilation.
      command: process.env.ADAPTIVE_E2E_WEBPACK === "1" ? "npx next build --webpack && npx next start -p 3200" : "npx next build && npx next start -p 3200",
      url: "http://localhost:3200/deals/hero",
      timeout: 300_000,
      reuseExistingServer: false,
      env: { ...NO_KEYS, ADAPTIVE_DEALS_DATA_DIR: ".data-e2e", ADAPTIVE_DEALS_DEMO_RUN: "synthetic" },
    },
    {
      command: "node e2e/wait-for-primary.mjs http://localhost:3200/deals && npx next start -p 3201",
      url: "http://localhost:3201/deals/hero",
      timeout: 300_000,
      reuseExistingServer: false,
      // An empty ADAPTIVE_DEALS_DEMO_RUN means no override: the committed recordings are used.
      env: { ...NO_KEYS, ADAPTIVE_DEALS_DATA_DIR: ".data-e2e-recorded", ADAPTIVE_DEALS_DEMO_RUN: "" },
    },
  ],
});
