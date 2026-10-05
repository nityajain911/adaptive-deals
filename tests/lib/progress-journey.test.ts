import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { driveTo, type HeroPath } from "../helpers/drive";

/**
 * Spec §3.4 through the real service: every hero step has one defined, truthful progress result.
 * The upfront payment and mandate are completed before the notice; the walk ends up to date at 21 Dec.
 */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-progress-"));
delete process.env.ADAPTIVE_DEALS_DEMO_RUN;
const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
  throw new Error("no network");
});
afterAll(() => fetchSpy.mockRestore());

type Svc = typeof import("@/lib/service");

async function walk(svc: Svc, path: HeroPath) {
  await svc.resetToSeed();
  const headlines: string[] = [];
  for (let i = 0; i < 40; i++) {
    const s = await svc.getState();
    const p = await svc.progressOf(s);
    expect(Object.values(p.stages).filter((x) => x === "current")).toHaveLength(1);
    expect(p.kind === "action_required").toBe(p.primaryAction !== null);
    if (headlines.at(-1) !== p.headline) headlines.push(p.headline);
    const before = s.events.length;
    const after = await driveTo(svc, (x) => x.events.length !== before, 2, path);
    if (after.events.length === before) break;
  }
  return { headlines, state: await svc.getState() };
}

const START = [
  "Confirm two details before we can recommend an offer.",
  "Waiting for the buyer to answer.",
  "The buyer answered. Use these answers to build an offer.",
  "Review this offer before sending it.",
  "Waiting for the buyer to review offer version 1.",
  "Buyer accepted. Waiting for the buyer to pay the upfront link and authorise recurring payments.",
  "Buyer accepted. Waiting for the buyer to authorise recurring payments.",
  "Up to date · next payment ₹23,010 on 1 Dec 2026.",
];
const END = [
  "The buyer can't pay until after 20 Dec 2026. Draft revised terms.",
  "The buyer asked to move a payment. Review the revised terms.",
  "Waiting for the buyer to accept the revised terms.",
  "Up to date · next payment ₹23,010 on 21 Dec 2026.",
];

describe("dealProgress across the hero journey", () => {
  it("failed-debit path: upfront paid, mandate, notice on 28 Nov, failed debit on 1 Dec, reply, amendment, up to date at 21 Dec", async () => {
    const svc = await import("@/lib/service");
    const { headlines, state } = await walk(svc, "failed_debit");
    expect(headlines).toEqual([...START, "Debit failed · retry scheduled for 4 Dec 2026.", ...END]);
    // The designed reduced-scope case records the two buyer answers at 09:20 and 09:22. Those
    // deliberate simulated replies advance the injected clock before the later payment events.
    expect(state.clockAdvances.map((a) => a.to)).toEqual([
      "2026-10-01T09:20:00+05:30",
      "2026-10-01T09:22:00+05:30",
      "2026-11-01T10:00:00+05:30",
      "2026-11-28T10:00:00+05:30",
      "2026-12-01T10:00:00+05:30",
    ]);
    expect(state.run.record.clockAdvances.map((a) => a.to)).toEqual(state.clockAdvances.map((a) => a.to)); // every clock move is in the run record
    expect(state.attempts.find((a) => a.method === "payment_link")!.status).toBe("succeeded");
    expect(state.attempts.filter((a) => a.scheduleLineId === "pay-2").map((a) => [a.status, a.dueDate])).toEqual([
      ["failed", "2026-12-01"],
      ["removed", "2026-12-04"],
      ["scheduled", "2026-12-21"],
    ]);
    expect(state.changeRequests[0].timing).toBe("after_failed_debit"); // existing amendment rules, unchanged
  });

  it("preventive path: the buyer replies to the 28 Nov notice before any debit; up to date at 21 Dec", async () => {
    const svc = await import("@/lib/service");
    const { headlines, state } = await walk(svc, "preventive");
    expect(headlines).toEqual([...START, ...END]);
    expect(state.attempts.some((a) => a.status === "failed")).toBe(false);
    expect(state.changeRequests[0].timing).toBe("preventive");
  });

  it("a stale earlier-version change request is never the required action", async () => {
    const svc = await import("@/lib/service");
    const { readJson, writeJsonAtomic } = await import("@/lib/store");
    const raw = (await readJson<Awaited<ReturnType<typeof svc.getState>>>(svc.STORE_FILE))!;
    raw.changeRequests.unshift({ ...raw.changeRequests[0], id: "chg-stale", state: "change_requested", amendmentId: null, agreementVersion: 1, history: [raw.changeRequests[0].history[0]] });
    await writeJsonAtomic(svc.STORE_FILE, raw);
    const p = await svc.progressOf(await svc.getState());
    expect(p.primaryAction).toBeNull();
    expect(p.headline).toBe("Up to date · next payment ₹23,010 on 21 Dec 2026.");
  });

  it("made no network or model call", () => expect(fetchSpy).not.toHaveBeenCalled());
});
