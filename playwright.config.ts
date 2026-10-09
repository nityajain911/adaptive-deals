import { defineConfig, devices } from "@playwright/test";

/**
 * Browser journeys against production builds with their own isolated data stores.
 *
 * The merchant journey on 3200 is pinned to the labelled hand-written sample. Port 3201 verifies
 * the committed Cerebras hero replay without credentials. The isolated Cerebras runtime on 3202
 * talks only to the localhost fixture server; it never reaches an external model.
 */
const NO_KEYS = { CEREBRAS_API_KEY: "", GROQ_API_KEY: "", ANTHROPIC_API_KEY: "", RAZORPAY_MODE: "simulated" };

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  projects: [
    { name: "sample", testMatch: ["journey.spec.ts", "walkthrough.spec.ts", "economics.spec.ts", "scope.spec.ts"], use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3200" } },
    { name: "recorded-hero", testMatch: ["recorded-hero.spec.ts"], use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3201" } },
    { name: "cerebras", testMatch: ["cerebras.spec.ts"], use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3202" } },
  ],
  webServer: [
    {
      // Default remains the production Turbopack build. The explicit fallback is for restricted
      // runners that forbid the local port Turbopack's PostCSS worker opens during compilation.
      command: process.env.ADAPTIVE_E2E_WEBPACK === "1" ? "npx next build --webpack && npx next start -p 3200" : "npx next build && npx next start -p 3200",
      // Readiness must not render a stateful route before the first test can reset its isolated store.
      url: "http://localhost:3200/sample-documents/pinecone-rate-card-oct-2026.csv",
      timeout: 300_000,
      reuseExistingServer: process.env.E2E_REUSE === "1",
      env: { ...NO_KEYS, ADAPTIVE_DEALS_DATA_DIR: ".data-e2e", ADAPTIVE_DEALS_DEMO_RUN: "synthetic" },
    },
    {
      command: "node e2e/wait-for-primary.mjs http://localhost:3200/deals && npx next start -p 3201",
      url: "http://localhost:3201/sample-documents/pinecone-rate-card-oct-2026.csv",
      timeout: 300_000,
      reuseExistingServer: process.env.E2E_REUSE === "1",
      env: { ...NO_KEYS, ADAPTIVE_DEALS_DATA_DIR: ".data-e2e-recorded", ADAPTIVE_DEALS_DEMO_RUN: "" },
    },
    {
      command: "node e2e/cerebras-fixture-server.mjs",
      url: "http://localhost:3202/sample-documents/pinecone-rate-card-oct-2026.csv",
      timeout: 300_000,
      reuseExistingServer: false,
      env: {
        ...NO_KEYS,
        ADAPTIVE_DEALS_PROVIDER: "cerebras",
        ADAPTIVE_DEALS_MODEL: "gpt-oss-120b",
        CEREBRAS_API_KEY: "csk-local-fixture",
        ADAPTIVE_DEALS_E2E: "1",
        CEREBRAS_API_BASE_URL: "http://127.0.0.1:4312/v1/chat/completions",
        ADAPTIVE_DEALS_DATA_DIR: ".data-e2e-cerebras",
        ADAPTIVE_DEALS_DEMO_RUN: "synthetic",
      },
    },
  ],
});
