import { describe, expect, it, vi } from "vitest";

// The status button uses the router; the markup is all these tests read.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { McpCollectionActionCard } from "@/components/mcp/collection-action-card";
import { createPaymentLinkIntent, type McpActionReceipt } from "@/mcp/intents";

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

describe("the Razorpay map and pre-flight note on the card", () => {
  it("maps each part of a deal when MCP is not connected, without claiming a call", () => {
    const html = renderToStaticMarkup(createElement(McpCollectionActionCard, { simulatedCollection: true }));
    expect(html).toContain("How this maps to Razorpay");
    for (const part of ["Upfront collection", "Auto-pay mandate", "Later debits", "Reporting and reconciliation"]) expect(html).toContain(part);
    expect(html).toContain("Implemented · test mode");
    expect(html).not.toMatch(/Subscriptions API for/i);
  });

  it("offers a read-only status check once a link has been created, and only then", () => {
    expect(renderToStaticMarkup(createElement(McpCollectionActionCard, { simulatedCollection: true, receipt: receipt("succeeded") }))).toContain("Check payment status");
    expect(renderToStaticMarkup(createElement(McpCollectionActionCard, { simulatedCollection: true, receipt: receipt("failed") }))).not.toContain("Check payment status");
  });

  it("warns on the review card when the amount is one Razorpay's test account refused", () => {
    const intent = (amountPaise: number) => ({ ...createPaymentLinkIntent({ dealId: "hero", agreementId: "agr", agreementVersion: 1, termsHash: "a".repeat(64), merchantId: "m", serverId: "s", toolName: "create_link", catalogHash: "b".repeat(64), inputSchemaHash: "c".repeat(64), amountPaise, currency: "INR", description: "d", reference: "r" }) });
    const render = (amountPaise: number) => renderToStaticMarkup(createElement(McpCollectionActionCard, { simulatedCollection: false, connection: { connected: true, via: "remote" } as never, intent: intent(amountPaise) }));
    expect(render(2_301_000)).toContain("mcp-preflight");
    expect(render(2_301_000)).toContain("This link may fail");
    expect(render(1_000_000)).not.toContain("mcp-preflight");
  });
});

