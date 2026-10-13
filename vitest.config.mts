import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
      // `server-only` throws outside a React Server environment; tests run plain Node.
      "server-only": path.resolve(import.meta.dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // The generated-economics property tests are heavy; run alongside ~170 other files they can pass the 5-second default on a busy machine.
    testTimeout: 120_000,
    // Unit suites assert the labelled hand-written sample unless a test opts into a recording explicitly.
    env: { ADAPTIVE_DEALS_DEMO_RUN: "synthetic" },
  },
});
