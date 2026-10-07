import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const dataDir = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-memory-"));
process.env.ADAPTIVE_DEALS_DATA_DIR = dataDir;
const store = await import("@/commercial-memory/store");

afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

describe("Commercial Memory runtime records", () => {
  it("stores retrieval attribution and merchant confirmations in additive files", async () => {
    await store.recordRetrievalRun({
      id: "retrieval-1", merchantId: "merchant-pinecone", buyerId: null, query: "website price", normalisedQuery: "website price",
      eligibleSourceIds: ["source-rate-card-2026"], candidateChunkIds: ["chunk-1"], selectedChunkIds: ["chunk-1"],
      ranking: "code", status: "found", createdAt: "2026-10-08T09:30:00+05:30",
    });
    await store.recordEvidenceConfirmation({
      id: "confirmation-1", retrievalRunId: "retrieval-1", field: "services.website-fixes.listPricePaise", claimId: "claim-1",
      decision: "confirmed", decidedBy: "Merchant", decidedAt: "2026-10-08T09:31:00+05:30", reason: null,
    });

    expect(await store.getRetrievalRun("retrieval-1")).toMatchObject({ status: "found", ranking: "code" });
    expect(await store.listEvidenceConfirmations("retrieval-1")).toHaveLength(1);
    expect(JSON.parse(readFileSync(path.join(dataDir, "retrieval/runs/retrieval-1.json"), "utf8"))).not.toHaveProperty("apiKey");
  });

  it("refuses duplicate records with different content", async () => {
    const run = (await store.getRetrievalRun("retrieval-1"))!;
    await expect(store.recordRetrievalRun({ ...run, query: "changed" })).rejects.toThrow(/already exists/i);
    await expect(store.recordEvidenceConfirmation({
      id: "confirmation-1", retrievalRunId: "retrieval-1", field: "other", claimId: "claim-2", decision: "rejected",
      decidedBy: "Merchant", decidedAt: "2026-10-08T09:32:00+05:30", reason: "Wrong source",
    })).rejects.toThrow(/already exists/i);
  });
});
