import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { McpCollectionActionCard } from "@/components/mcp/collection-action-card";
import type { McpActionReceipt } from "@/mcp/intents";

const receipt = (outcome: McpActionReceipt["outcome"]): McpActionReceipt => ({
  intentId: "intent", serverId: "server", toolName: "tool", catalogHash: "a".repeat(64), argumentsHash: "b".repeat(64),
  requestedAt: "2026-10-08T12:00:00+05:30", completedAt: outcome === "unknown" ? null : "2026-10-08T12:00:01+05:30", outcome,
  externalId: outcome === "succeeded" ? "plink_test_1" : null, shortUrl: outcome === "succeeded" ? "https://rzp.io/i/test" : null,
  externalStatus: outcome === "succeeded" ? "created" : null, responseHash: outcome === "succeeded" ? "c".repeat(64) : null,
  errorCode: outcome === "succeeded" ? null : "safe_code", safeError: outcome === "succeeded" ? null : "Safe failure",
});

describe("MCP collection card labels", () => {
  it("distinguishes unavailable, successful test, unknown and failed states", () => {
    expect(renderToStaticMarkup(createElement(McpCollectionActionCard, { simulatedCollection: true }))).toContain("No Razorpay MCP action occurred");
    expect(renderToStaticMarkup(createElement(McpCollectionActionCard, { simulatedCollection: true, receipt: receipt("succeeded") }))).toContain("Created through Razorpay MCP · Test mode");
    expect(renderToStaticMarkup(createElement(McpCollectionActionCard, { simulatedCollection: true, receipt: receipt("unknown") }))).toContain("reconcile the reference");
    expect(renderToStaticMarkup(createElement(McpCollectionActionCard, { simulatedCollection: true, receipt: receipt("failed") }))).toContain("not replaced by a simulation");
  });
});
