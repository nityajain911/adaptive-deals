import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { driveTo } from "../helpers/drive";

/** Spec §3.4 through the real service: every hero step has one defined, truthful progress result. */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-progress-"));
delete process.env.ADAPTIVE_DEALS_DEMO_RUN;
const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
  throw new Error("no network");
});
afterAll(() => fetchSpy.mockRestore());

describe("dealProgress across the hero journey", () => {
  it("walks Understand → Offer → Track with exactly one current stage and no false 'no pending actions'", async () => {
    const svc = await import("@/lib/service");
    await svc.resetToSeed();
    const rules: string[] = [];
    for (let i = 0; i < 30; i++) {
      const s = await svc.getState();
      const p = await svc.progressOf(s);
      expect(Object.values(p.stages).filter((x) => x === "current")).toHaveLength(1);
      expect(p.kind === "action_required").toBe(p.primaryAction !== null);
      if (s.mandate?.status === "pending") expect([p.kind, p.headline]).toEqual(["waiting_on_buyer", expect.stringMatching(/authorise recurring payments/)]);
      if (rules.at(-1) !== p.rule) rules.push(p.rule);
      const before = s.events.length;
      const after = await driveTo(svc, (x) => x.events.length !== before, 2);
      if (after.events.length === before) break;
    }
    expect(rules).toEqual([
      "understand.send",
      "understand.waiting",
      "understand.use_answers",
      "offer.review",
      "track.sent_awaiting_buyer",
      "track.buyer_setup",
      "track.change_request",
      "track.amendment_merchant",
      "track.amendment_buyer",
      "track.buyer_setup",
    ]);
  });

  it("a stale earlier-version change request is never the required action", async () => {
    const svc = await import("@/lib/service");
    const { readJson, writeJsonAtomic } = await import("@/lib/store");
    const raw = (await readJson<Awaited<ReturnType<typeof svc.getState>>>(svc.STORE_FILE))!;
    raw.changeRequests.unshift({ ...raw.changeRequests[0], id: "chg-stale", state: "change_requested", amendmentId: null, agreementVersion: 1, history: [raw.changeRequests[0].history[0]] });
    await writeJsonAtomic(svc.STORE_FILE, raw);
    const p = await svc.progressOf(await svc.getState());
    expect(p.primaryAction?.id).not.toBe("draft_revised_terms");
    expect(p.rule).toBe("track.buyer_setup");
  });

  it("made no network or model call", () => expect(fetchSpy).not.toHaveBeenCalled());
});
