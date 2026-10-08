import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { driveTo } from "../helpers/drive";
import type { McpToolCatalog } from "@/mcp/types";

const dataDir = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-mcp-service-"));
process.env.ADAPTIVE_DEALS_DATA_DIR = dataDir;
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic";
let svc: typeof import("@/lib/service");
let mcp: typeof import("@/lib/mcp-service");

const tool = { name: "create_link", metadata: { provider: "razorpay", environment: "test", capability: "create_payment_link" }, inputSchema: { type: "object", properties: Object.fromEntries(["amount", "currency", "description", "reference", "idempotency_key"].map((key) => [key, { type: key === "amount" ? "integer" : "string" }])), required: ["amount", "currency", "description", "reference", "idempotency_key"], additionalProperties: false }, outputSchema: { type: "object", properties: { id: { type: "string" }, short_url: { type: "string" }, status: { type: "string" } }, required: ["id", "short_url", "status"] } };
const catalog: McpToolCatalog = { serverId: "razorpay-local", serverVersion: "1", mode: "test", tools: [tool] };
const transport = { listTools: async () => catalog, callTool: async () => ({ structuredContent: { id: "plink_test_mcp", short_url: "https://rzp.io/i/mcp", status: "created" } }) };

beforeAll(async () => { svc = await import("@/lib/service"); mcp = await import("@/lib/mcp-service"); });
beforeEach(async () => { await svc.resetToSeed(); rmSync(path.join(dataDir, "mcp"), { recursive: true, force: true }); });
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

describe("accepted agreement to approved MCP collection", () => {
  it("prepares only after buyer acceptance and shows exact canonical action inputs", async () => {
    await expect(mcp.prepareMcpCollectionIntent(transport)).rejects.toThrow(/active accepted agreement/i);
    await driveTo(svc, (state) => state.status === "active");
    const intent = await mcp.prepareMcpCollectionIntent(transport);
    expect(intent).toMatchObject({ status: "draft", mode: "test", agreementVersion: 1, canonicalArguments: { amount: 2301000, currency: "INR", reference: expect.any(String) } });
  });

  it("re-reads current terms and catalog before approval and executes the exact approved intent", async () => {
    await driveTo(svc, (state) => state.status === "active");
    const draft = await mcp.prepareMcpCollectionIntent(transport);
    const approved = await mcp.approveMcpCollectionIntent(draft.id, transport);
    expect(approved).toMatchObject({ status: "approved", approvedBy: "Merchant (Pinecone Media Works)" });
    const receipt = await mcp.executeMcpCollectionIntent(approved.id, transport);
    expect(receipt).toMatchObject({ outcome: "succeeded", externalId: "plink_test_mcp" });
  });

  it("refuses a stale catalog and an unavailable connection without switching to simulation", async () => {
    await driveTo(svc, (state) => state.status === "active");
    const draft = await mcp.prepareMcpCollectionIntent(transport);
    await expect(mcp.approveMcpCollectionIntent(draft.id, { ...transport, listTools: async () => ({ ...catalog, serverVersion: "2" }) })).rejects.toThrow(/changed|stale/i);
    await expect(mcp.prepareMcpCollectionIntent()).rejects.toThrow(/No compatible|not connected|unavailable/i);
  });
});
