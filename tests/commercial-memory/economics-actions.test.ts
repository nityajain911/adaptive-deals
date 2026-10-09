import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const dataDir = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-memory-actions-"));
process.env.ADAPTIVE_DEALS_DATA_DIR = dataDir;
const { POST } = await import("@/app/api/commercial-memory/actions/route");
const economics = await import("@/lib/economics-store");

const post = async (body: unknown) => {
  const response = await POST(new Request("http://localhost/api/commercial-memory/actions", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  return { response, body: await response.json() as { ok: boolean; result?: unknown; error?: string } };
};

beforeEach(async () => economics.resetEconomicsStore());
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

describe("Commercial Memory economics actions", () => {
  it("re-reads trusted evidence and saves only confirmed proposals as an ordinary draft", async () => {
    const drafted = await post({ action: "draft_economics_from_memory" });
    expect(drafted.response.status).toBe(200);
    expect(drafted.body.result).toMatchObject({ status: "ready", proposals: expect.any(Array) });
    const result = drafted.body.result as { id: string; proposals: { id: string; field: string }[] };
    const websiteCost = result.proposals.find((proposal) => proposal.field === "services.website-fixes.directCostPaise")!;

    const confirmed = await post({ action: "confirm_economics_from_memory", draftId: result.id, proposalIds: [websiteCost.id] });
    expect(confirmed.body).toMatchObject({ ok: true, result: { savedDraft: true, confirmed: 1 } });
    expect((await economics.getEconomicsStore()).versions).toHaveLength(1);
    expect((await economics.getEconomicsStore()).draft).not.toBeNull();
  });

  it("refuses unknown fields, stale draft IDs and unsupported payloads", async () => {
    expect((await post({ action: "draft_economics_from_memory", extra: true })).response.status).toBe(400);
    expect((await post({ action: "confirm_economics_from_memory", draftId: "stale", proposalIds: [] })).body.error).toMatch(/changed/i);
    expect((await post({ action: "other" })).response.status).toBe(400);
  });

  it("tests an unseen query with exact evidence and an honest code fallback", async () => {
    const tested = await post({ action: "test_memory_query", query: "Can monthly reporting be sold by itself?", liveAi: false });
    expect(tested.response.status).toBe(200);
    expect(tested.body.result).toMatchObject({
      status: "found",
      attribution: "code",
      note: "Ranked by deterministic lexical retrieval",
    });
    expect((tested.body.result as { candidates: unknown[] }).candidates[0]).toMatchObject({ sourceId: "source-service-rules", quote: expect.stringContaining("Monthly reporting") });
  });

  it("uses the centrally configured Cerebras reranker instead of checking only for a Groq key", async () => {
    process.env.ADAPTIVE_DEALS_PROVIDER = "cerebras";
    process.env.CEREBRAS_API_KEY = "csk-fixture";
    const original = globalThis.fetch;
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
      const user = JSON.parse(body.messages[1]!.content) as { candidates: { chunkId: string }[] };
      const ids = user.candidates.map((candidate) => candidate.chunkId);
      return new Response(JSON.stringify({ model: "gpt-oss-120b", choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ order: ids, relevance: ids.map((chunkId) => ({ chunkId, label: "supporting" })) }) } }] }), { status: 200 });
    };
    try {
      const tested = await post({ action: "test_memory_query", query: "Can monthly reporting be sold by itself?", liveAi: true });
      expect(tested.body.result, JSON.stringify(tested.body)).toMatchObject({ attribution: "live_ai", note: "Reranked live by Cerebras" });
    } finally {
      globalThis.fetch = original;
      delete process.env.ADAPTIVE_DEALS_PROVIDER;
      delete process.env.CEREBRAS_API_KEY;
    }
  });

  it("abstains for an unsupported query and never fills the result with weak evidence", async () => {
    const tested = await post({ action: "test_memory_query", query: "What is our office electricity bill?", liveAi: false });
    expect(tested.body.result).toMatchObject({ status: "insufficient_evidence", attribution: "code", candidates: [] });
  });

  it("shows a labelled simulated conflict without changing the trusted corpus", async () => {
    const tested = await post({ action: "demonstrate_memory_conflict" });
    expect(tested.body.result).toMatchObject({
      status: "conflicting_evidence",
      simulated: true,
      field: "services.website-fixes.listPricePaise",
      values: expect.arrayContaining([expect.objectContaining({ value: "2100000" }), expect.objectContaining({ value: "2400000" })]),
    });
  });
});
