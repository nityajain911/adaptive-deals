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
});
