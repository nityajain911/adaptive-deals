import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
const { McpCollectionActionCard } = await import("@/components/mcp/collection-action-card");
const { createPaymentLinkIntent, approveMcpIntent } = await import("@/mcp/intents");

const draft = () => createPaymentLinkIntent({ dealId: "hero", agreementId: "agr-hero", agreementVersion: 1, termsHash: "a".repeat(64), merchantId: "merchant-pinecone", serverId: "razorpay-mcp:razorpay-mcp-server", toolName: "create_payment_link", catalogHash: "b".repeat(64), inputSchemaHash: "c".repeat(64), amountPaise: 2301000, currency: "INR", description: "Phase 1", reference: "agr-hero-line1-1", customer: { name: "Kestrel Lane Clinics" } });
const html = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(McpCollectionActionCard, { simulatedCollection: true, ...props } as never));

describe("the Razorpay action card follows the connection and the intent", () => {
  it.each([
    [{ connected: false, reason: "not_configured" }, "No Razorpay MCP server is configured"],
    [{ connected: false, reason: "live_key_refused" }, "live Razorpay key was refused"],
    [{ connected: false, reason: "missing_key" }, "test key is not set"],
  ] as const)("says why it is not connected: %j", (connection, text) => {
    const out = html({ connection });
    expect(out).toContain("Razorpay MCP is not connected");
    expect(out).toContain(text);
    expect(out).toContain("No Razorpay MCP action occurred");
    expect(out).not.toContain("mcp-prepare");
  });

  it("when connected and nothing is prepared, offers only a review that sends nothing", () => {
    const out = html({ connection: { connected: true, via: "remote" } });
    expect(out).toContain("Razorpay MCP is connected · Test mode");
    expect(out).toContain("Review Razorpay test Payment Link");
    expect(out).toContain("Nothing is sent to Razorpay yet");
    expect(out).not.toContain("mcp-approve-create");
  });

  it("shows the exact action, its test-mode label and what is sent, before any approval", () => {
    const out = html({ connection: { connected: true, via: "stdio" }, intent: draft() });
    expect(out).toContain("₹23,010");
    expect(out).toContain("Test mode only · no real money moves");
    expect(out).toContain("create_payment_link on razorpay-mcp:razorpay-mcp-server");
    expect(out).toContain("agr-hero-line1-1");
    expect(out).toContain("No SMS or email is sent to anyone");
    expect(out).toContain("Approve and create test Payment Link");
  });

  it("after approval but no receipt, offers only the create step", () => {
    const approved = approveMcpIntent(draft(), "Merchant", "2026-10-08T12:00:00+05:30");
    const out = html({ connection: { connected: true, via: "remote" }, intent: approved });
    expect(out).toContain("Create test Payment Link");
    expect(out).not.toContain("Approve and create test Payment Link");
  });

  it("never leaks a secret-shaped value into its markup", () => {
    expect(html({ connection: { connected: true, via: "remote" }, intent: draft() })).not.toMatch(/rzp_(test|live)_|secret/i);
  });
});
