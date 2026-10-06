import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { driveTo } from "../helpers/drive";

/**
 * The merchant answers a buyer's request for a lower amount on a proposal that is not yet accepted:
 * the engine rechecks the new total, a failed rule needs an explicit recorded override, and the
 * result is a new version that replaces the old one only once it is approved and sent.
 */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-counter-"));
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic";
type Svc = typeof import("@/lib/service");
let svc: Svc;
let presenter: typeof import("@/lib/presenter-store");
const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
  throw new Error("no network");
});
beforeAll(async () => {
  svc = await import("@/lib/service");
  presenter = await import("@/lib/presenter-store");
});
afterAll(() => fetchSpy.mockRestore());

const TOTAL = 4_602_000; // the sent proposal's total
const ASK = 4_000_000;

async function sentWithRequest() {
  await svc.resetToSeed();
  await presenter.setFailNextSend(false);
  await driveTo(svc, (s) => s.status === "options_ready");
  const d = await svc.reviewBuyerProposal();
  await svc.approveDraft(d.version, d.termsHash);
  await svc.sendProposal(d.version);
  await svc.requestChange(d.version, "Could you do ₹40,000 instead?");
  return d;
}

describe("checking a counter-offer", () => {
  it("rechecks the amount with the engine and names what fails, changing nothing", async () => {
    await sentWithRequest();
    const before = await svc.getState();
    const check = await svc.checkCounterOffer(ASK);
    expect(check.totalPaise).toBeLessThan(TOTAL);
    expect(Math.abs(check.totalPaise - ASK)).toBeLessThanOrEqual(2);
    expect(check.passes).toBe(false);
    expect(check.failing.map((f) => f.id)).toContain("discount_limit");
    expect(check.failing.every((f) => f.text.length > 0)).toBe(true);
    expect(await svc.getState()).toEqual(before);
  });

  it.each([
    ["a total that is not lower", TOTAL, /lower than the current offer/i],
    ["zero", 0, /positive/i],
  ])("refuses %s", async (_n, value, message) => {
    await sentWithRequest();
    await expect(svc.checkCounterOffer(value)).rejects.toThrow(message);
  });

  it("is only available on a sent, unaccepted proposal with an open buyer request", async () => {
    await svc.resetToSeed();
    await driveTo(svc, (s) => s.status === "options_ready");
    await expect(svc.checkCounterOffer(ASK)).rejects.toThrow(/not yet accepted|open buyer request/i);
  });
});

describe("making a counter-offer", () => {
  it("refuses a failing amount without the override, and changes nothing", async () => {
    await sentWithRequest();
    const before = await svc.getState();
    await expect(svc.makeCounterOffer(ASK, false)).rejects.toThrow(/override/i);
    expect(await svc.getState()).toEqual(before);
  });

  it("with an explicit override, records it, withdraws the old version and prepares a new draft for the usual preview", async () => {
    const original = await sentWithRequest();
    const s = await svc.makeCounterOffer(ASK, true);
    const counter = s.counterOffers.at(-1)!;
    expect(counter).toMatchObject({ fromVersion: original.version, requestMessageId: expect.any(String) });
    expect(counter.override).toMatchObject({ by: "Merchant (Pinecone Media Works)", checks: expect.arrayContaining(["DISCOUNT_ABOVE_LIMIT"]) });
    expect(s.agreements.find((v) => v.version === original.version)!.status).toBe("superseded");
    expect(s.status).toBe("options_ready");
    expect(s.workDispositions.at(-1)).toMatchObject({ kind: "countered", sourceKind: "message" });
    expect(await svc.progressOf(s)).toMatchObject({ stage: "offer", rule: "offer.review" });

    const draft = await svc.reviewBuyerProposal();
    expect(draft.version).toBe(original.version + 1);
    expect(draft.supersedes).toBe(original.version);
    expect(Math.abs(draft.terms.pricing.totalPaise - ASK)).toBeLessThanOrEqual(2);
    expect(draft.terms.pricing.totalPaise).toBeLessThan(TOTAL);
  });

  it("goes through approve and send like any proposal, and the buyer's page then shows the new version", async () => {
    const original = await sentWithRequest();
    await svc.makeCounterOffer(ASK, true);
    const draft = await svc.reviewBuyerProposal();
    await svc.approveDraft(draft.version, draft.termsHash);
    const sent = await svc.sendProposal(draft.version);
    expect(sent.delivered).toBe(true);
    const s = await svc.getState();
    expect(s.status).toBe("sent");
    expect(s.agreements.map((v) => [v.version, v.status])).toEqual([[original.version, "superseded"], [draft.version, "sent"]]);
    expect(await svc.progressOf(s)).toMatchObject({ stage: "track", rule: "track.sent_awaiting_buyer" });
  });

  it("can be accepted by the buyer, and the collection then follows the countered amounts", async () => {
    await sentWithRequest();
    await svc.makeCounterOffer(ASK, true);
    const draft = await svc.reviewBuyerProposal();
    await svc.approveDraft(draft.version, draft.termsHash);
    await svc.sendProposal(draft.version);
    const s = await svc.acceptAgreement(draft.version, draft.termsHash, true);
    expect(s.agreements.find((v) => v.version === draft.version)!.buyerAcceptance).not.toBeNull();
    expect(s.attempts.reduce((a, x) => a + x.amountPaise, 0)).toBe(draft.terms.pricing.totalPaise);
  });

  it("shows the audit who decided: the engine's failed rule, and the merchant's override", async () => {
    await sentWithRequest();
    const s = await svc.makeCounterOffer(ASK, true);
    expect(s.events.some((e) => e.kind === "counter_offer_created" && e.provenance === "merchant")).toBe(true);
  });
});
