import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("MCP verification report", () => {
  it("states exact counts and never implies that a real Razorpay tool ran", () => {
    const report = JSON.parse(readFileSync("evaluation/mcp/report.json", "utf8"));
    expect(report).toMatchObject({
      mode: "injected-transport-tests",
      realRazorpayMcpCallMade: false,
      phase0Status: "unavailable",
      counts: {
        noWriteBeforeExplicitApproval: { correct: 1, total: 1 },
        duplicateExternalActions: { count: 0, executions: 1 },
        unsupportedOrUnsafeCatalogsRefused: { correct: 3, total: 3 },
        unknownOutcomesReconciledBeforeRetry: { correct: 1, total: 1 },
        liveModeCatalogsAccepted: { count: 0, tested: 1 },
      },
    });
  });
});
