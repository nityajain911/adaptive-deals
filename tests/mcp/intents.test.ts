import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { approveMcpIntent, createPaymentLinkIntent, intentApprovalIsCurrent, reducePaymentLinkReceipt } from "@/mcp/intents";

const dataDir = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-mcp-intents-"));
process.env.ADAPTIVE_DEALS_DATA_DIR = dataDir;
const store = await import("@/mcp/store");

const build = () => createPaymentLinkIntent({
  dealId: "hero", agreementId: "agr-hero", agreementVersion: 1, termsHash: "a".repeat(64),
  merchantId: "merchant-pinecone", serverId: "razorpay-local", toolName: "provider_create", catalogHash: "b".repeat(64), inputSchemaHash: "c".repeat(64),
  amountPaise: 2_301_000, currency: "INR", description: "Kestrel Phase 1", reference: "agr-hero-v1", customer: { name: "Kestrel Lane Clinics", email: "accounts@example.test" },
});

beforeEach(() => rmSync(path.join(dataDir, "mcp"), { recursive: true, force: true }));
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

describe("MCP action intents and reduced receipts", () => {
  it("creates deterministic test-mode hashes and idempotency keys without secrets", () => {
    const first = build(); const second = build();
    expect(first).toMatchObject({ mode: "test", status: "draft", argumentsHash: expect.stringMatching(/^[a-f0-9]{64}$/), idempotencyKey: expect.stringMatching(/^ad_[a-f0-9]{32}$/) });
    expect(second).toEqual(first);
    expect(JSON.stringify(first)).not.toMatch(/secret|api[_-]?key/i);
  });

  it("binds approval to the exact arguments, terms and catalog", () => {
    const approved = approveMcpIntent(build(), "Merchant (Pinecone Media Works)", "2026-10-08T12:00:00+05:30");
    expect(intentApprovalIsCurrent(approved, { termsHash: approved.termsHash, argumentsHash: approved.argumentsHash, catalogHash: approved.catalogHash })).toBe(true);
    expect(intentApprovalIsCurrent(approved, { termsHash: "d".repeat(64), argumentsHash: approved.argumentsHash, catalogHash: approved.catalogHash })).toBe(false);
    expect(intentApprovalIsCurrent(approved, { termsHash: approved.termsHash, argumentsHash: approved.argumentsHash, catalogHash: "e".repeat(64) })).toBe(false);
  });

  it("reduces a valid tool result to allowlisted receipt fields and a response hash", () => {
    const intent = approveMcpIntent(build(), "Merchant", "2026-10-08T12:00:00+05:30");
    const receipt = reducePaymentLinkReceipt(intent, { id: "plink_test_123", short_url: "https://rzp.io/i/test123", status: "created", secret: "must-not-survive" }, "2026-10-08T12:00:01+05:30");
    expect(receipt).toMatchObject({ outcome: "succeeded", externalId: "plink_test_123", externalStatus: "created" });
    expect(JSON.stringify(receipt)).not.toContain("must-not-survive");
    expect(receipt.responseHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("persists intents and receipts additively and refuses changed duplicate IDs", async () => {
    const intent = build();
    expect(await store.recordMcpIntent(intent)).toEqual(intent);
    expect(await store.getMcpIntent(intent.id)).toEqual(intent);
    await expect(store.recordMcpIntent({ ...intent, termsHash: "f".repeat(64) })).rejects.toThrow(/different content/i);
    const receipt = reducePaymentLinkReceipt(approveMcpIntent(intent, "Merchant", "2026-10-08T12:00:00+05:30"), { id: "plink_test_123", short_url: "https://rzp.io/i/test123", status: "created" }, "2026-10-08T12:00:01+05:30");
    expect(await store.recordMcpReceipt(receipt)).toEqual(receipt);
    expect(await store.getMcpReceipt(intent.id)).toEqual(receipt);
  });
});
