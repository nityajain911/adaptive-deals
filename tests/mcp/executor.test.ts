import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { bindRazorpayCapabilities } from "@/mcp/capabilities";
import { approveMcpIntent, createPaymentLinkIntent } from "@/mcp/intents";
import type { McpToolCatalog } from "@/mcp/types";

const dataDir = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-mcp-executor-"));
process.env.ADAPTIVE_DEALS_DATA_DIR = dataDir;
const store = await import("@/mcp/store");
const { executeMcpIntent, refreshMcpReceipt } = await import("@/mcp/executor");

const createTool = { name: "create_link", metadata: { provider: "razorpay", environment: "test", capability: "create_payment_link" }, inputSchema: { type: "object", properties: Object.fromEntries(["amount", "currency", "description", "reference", "idempotency_key"].map((key) => [key, { type: key === "amount" ? "integer" : "string" }])), required: ["amount", "currency", "description", "reference", "idempotency_key"], additionalProperties: false }, outputSchema: { type: "object", properties: { id: { type: "string" }, short_url: { type: "string" }, status: { type: "string" } }, required: ["id", "short_url", "status"] } };
const fetchTool = { name: "fetch_link", metadata: { provider: "razorpay", environment: "test", capability: "fetch_payment_link" }, inputSchema: { type: "object", properties: { reference: { type: "string" } }, required: ["reference"], additionalProperties: false }, outputSchema: createTool.outputSchema };
const catalog: McpToolCatalog = { serverId: "razorpay-local", serverVersion: "1", mode: "test", tools: [createTool, fetchTool] };

const approved = () => {
  const binding = bindRazorpayCapabilities(catalog).bindings.createTestPaymentLink!;
  return approveMcpIntent(createPaymentLinkIntent({ dealId: "hero", agreementId: "agr", agreementVersion: 1, termsHash: "a".repeat(64), merchantId: "merchant-pinecone", serverId: binding.serverId, toolName: binding.toolName, catalogHash: binding.catalogHash, inputSchemaHash: binding.inputSchemaHash, amountPaise: 2301000, currency: "INR", description: "Phase 1", reference: "agr-v1" }), "Merchant", "2026-10-08T12:00:00+05:30");
};

beforeEach(() => rmSync(path.join(dataDir, "mcp"), { recursive: true, force: true }));
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

describe("checking the status of a created link", () => {
  it("reads the link by reference with the read tool only, and stores the new status", async () => {
    const intent = approved(); await store.recordMcpIntent(intent);
    const calls: string[] = [];
    let status = "created";
    const transport = { listTools: async () => catalog, callTool: async ({ name }: { name: string }) => { calls.push(name); return { structuredContent: { id: "plink_test_1", short_url: "https://rzp.io/i/test1", status } }; } };
    await executeMcpIntent(intent.id, transport, "2026-10-08T12:00:01+05:30");
    status = "paid";
    const result = await refreshMcpReceipt(intent.id, transport, "2026-10-08T12:05:00+05:30");
    expect(result.refreshed).toBe(true);
    expect(result.receipt).toMatchObject({ outcome: "succeeded", externalStatus: "paid", externalId: "plink_test_1" });
    expect(calls).toEqual(["create_link", "fetch_link"]);
    expect(await store.getMcpReceipt(intent.id)).toMatchObject({ externalStatus: "paid" });
  });

  it("keeps the receipt on file when the read fails, and refuses to run before a link exists", async () => {
    const intent = approved(); await store.recordMcpIntent(intent);
    const ok = { listTools: async () => catalog, callTool: async () => ({ structuredContent: { id: "plink_test_1", short_url: "https://rzp.io/i/test1", status: "created" } }) };
    await expect(refreshMcpReceipt(intent.id, ok, "2026-10-08T12:00:01+05:30")).rejects.toThrow(/no created link/i);
    await executeMcpIntent(intent.id, ok, "2026-10-08T12:00:02+05:30");
    const broken = { listTools: async () => catalog, callTool: async () => { throw new Error("provider unavailable"); } };
    const result = await refreshMcpReceipt(intent.id, broken, "2026-10-08T12:05:00+05:30");
    expect(result).toMatchObject({ refreshed: false, receipt: { externalStatus: "created" } });
  });
});

describe("idempotent MCP execution", () => {
  it("requires exact approval and stores one successful reduced receipt", async () => {
    const intent = approved(); await store.recordMcpIntent(intent);
    const calls: string[] = [];
    const transport = { listTools: async () => catalog, callTool: async ({ name }: { name: string }) => { calls.push(name); return { structuredContent: { id: "plink_test_1", short_url: "https://rzp.io/i/test1", status: "created", credential: "never-store" } }; } };
    const first = await executeMcpIntent(intent.id, transport, "2026-10-08T12:00:01+05:30");
    const second = await executeMcpIntent(intent.id, transport, "2026-10-08T12:00:02+05:30");
    expect(first).toMatchObject({ outcome: "succeeded", externalId: "plink_test_1" });
    expect(second).toEqual(first);
    expect(calls).toEqual(["create_link"]);
    expect(JSON.stringify(await store.getMcpReceipt(intent.id))).not.toContain("never-store");
  });

  it("refuses a draft intent and a changed catalog before any write", async () => {
    const draft = { ...approved(), status: "draft" as const, approvedBy: null, approvedAt: null };
    await store.recordMcpIntent(draft);
    const transport = { listTools: async () => catalog, callTool: async () => { throw new Error("must not call"); } };
    await expect(executeMcpIntent(draft.id, transport, "2026-10-08T12:00:01+05:30")).rejects.toThrow(/approved/i);
    const intent = approved(); await store.saveMcpIntent(intent);
    await expect(executeMcpIntent(intent.id, { ...transport, listTools: async () => ({ ...catalog, serverVersion: "2" }) }, "2026-10-08T12:00:01+05:30")).rejects.toThrow(/catalog/i);
  });

  it("marks a timeout unknown and reconciles through the read tool before any retry", async () => {
    const intent = approved(); await store.recordMcpIntent(intent);
    const calls: string[] = [];
    let first = true;
    const transport = { listTools: async () => catalog, callTool: async ({ name }: { name: string }) => { calls.push(name); if (first) { first = false; const error = new Error("timeout"); error.name = "TimeoutError"; throw error; } return { structuredContent: { id: "plink_test_2", short_url: "https://rzp.io/i/test2", status: "created" } }; } };
    expect(await executeMcpIntent(intent.id, transport, "2026-10-08T12:00:01+05:30")).toMatchObject({ outcome: "unknown" });
    expect(await executeMcpIntent(intent.id, transport, "2026-10-08T12:00:02+05:30")).toMatchObject({ outcome: "succeeded", externalId: "plink_test_2" });
    expect(calls).toEqual(["create_link", "fetch_link"]);
  });

  it("labels a tool error as a clean failure and scrubs key-shaped text from what it shows", async () => {
    const { safeToolError } = await import("@/mcp/executor");
    expect(safeToolError([{ type: "text", text: "creating payment link failed: key rzp_test_AbCdEf123456 is not allowed   " + "x".repeat(40) }])).toBe("creating payment link failed: key [key] is not allowed [redacted]");
    expect(safeToolError(undefined)).toBe("no detail was given");
  });

  it("treats an unreadable reply as unknown, not failed, and a thrown error as a safe failure", async () => {
    const malformed = approved(); await store.recordMcpIntent(malformed);
    const badTransport = { listTools: async () => catalog, callTool: async () => ({ structuredContent: { url: "wrong" } }) };
    expect(await executeMcpIntent(malformed.id, badTransport, "2026-10-08T12:00:01+05:30")).toMatchObject({ outcome: "unknown", errorCode: "malformed_response" }); // changed: a reply we cannot read may belong to a link that exists, so it must be reconciled by reference first
    rmSync(path.join(dataDir, "mcp"), { recursive: true, force: true });
    const failed = approved(); await store.recordMcpIntent(failed);
    const failedTransport = { listTools: async () => catalog, callTool: async () => { throw new Error("provider unavailable with secret-value"); } };
    const receipt = await executeMcpIntent(failed.id, failedTransport, "2026-10-08T12:00:01+05:30");
    expect(receipt).toMatchObject({ outcome: "failed", errorCode: "provider_error", safeError: "Razorpay MCP could not complete the test action" });
    expect(JSON.stringify(receipt)).not.toContain("secret-value");
  });
});
