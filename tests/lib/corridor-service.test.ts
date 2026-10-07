import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { driveTo } from "../helpers/drive";

/**
 * When a buyer asks for a lower price, the merchant sees what the request does to their economics:
 * the lowest total that meets every rule, the discounts their business economics permit, and other
 * ways to lower the buyer's payment. All of it is computed by code; nothing is sent to the buyer.
 */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-corridor-"));
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic";
type Svc = typeof import("@/lib/service");
let svc: Svc;
let store: typeof import("@/lib/economics-store");
let presenter: typeof import("@/lib/presenter-store");
const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
  throw new Error("no network");
});
beforeAll(async () => {
  svc = await import("@/lib/service");
  store = await import("@/lib/economics-store");
  presenter = await import("@/lib/presenter-store");
});
afterAll(() => fetchSpy.mockRestore());

const CURRENT = 4_602_000;
const TWO_PAYMENTS = "phased_scope:scope=web-search-report-3m,plan=two_monthly";
const UPFRONT = "phased_scope:scope=web-search-report-3m,plan=upfront";

beforeEach(async () => {
  await store.resetEconomicsStore();
});

/** The illustrative economics: a 10% maximum discount, with 0%, 5% and 10% approved. */
async function activateIllustrative() {
  const { defaultEconomicsContent } = await import("@/lib/economics-default");
  const draft = defaultEconomicsContent();
  draft.guardrails.discountLimitBps = 1000;
  draft.discountLadderBps = [0, 500, 1000];
  await store.saveEconomicsDraft(draft);
  await store.activateEconomicsDraft("Merchant (Pinecone Media Works)", "2026-10-06T10:00:00+05:30");
}

async function sentWithRequest(topic: "price" | "date" = "price") {
  await svc.resetToSeed();
  await presenter.setFailNextSend(false);
  await driveTo(svc, (s) => s.status === "options_ready");
  const d = await svc.reviewBuyerProposal();
  await svc.approveDraft(d.version, d.termsHash);
  await svc.sendProposal(d.version);
  await svc.requestChange(d.version, topic === "price" ? "Could you do a lower total?" : "Could we pay on 15 November?", topic);
  return d;
}

describe("with a merchant who permits no discount", () => {
  it("shows one row, the current offer; the lowest compliant total is the current offer; and nothing was computed for a request yet", async () => {
    await sentWithRequest();
    const view = await svc.corridorFor({});
    expect(view.currentTotalPaise).toBe(CURRENT);
    expect(view.check).toBeNull();
    expect(view.requestedTotalPaise).toBeNull();
    expect(view.lowestCompliantPaise).toBe(CURRENT);
    expect(view.lowestUnavailable).toBeNull();
    expect(view.ladder).toEqual([expect.objectContaining({ discountBps: 0, structureId: TWO_PAYMENTS, totalPaise: CURRENT, passes: true, isCurrent: true })]);
  });

  it("lists other ways to lower the buyer's payment: the same scope paid differently, never a bigger scope", async () => {
    await sentWithRequest();
    const view = await svc.corridorFor({});
    expect(view.timingAlternatives.map((a) => a.structureId)).toEqual([UPFRONT]);
    expect(view.scopeAlternatives).toEqual([]);
    expect(view.timingAlternatives[0]).toMatchObject({ totalPaise: CURRENT, headline: expect.stringContaining("paid upfront") });
  });

  it("checks the buyer's amount against the rules: including GST as stated", async () => {
    await sentWithRequest();
    const view = await svc.corridorFor({ requestedPaise: 4_000_000, gstBasis: "including" });
    expect(view.gstBasis).toBe("including");
    expect(view.requestedTotalPaise).toBe(4_000_000);
    expect(view.check).toMatchObject({ passes: false, totalPaise: 4_000_000 });
    expect(view.check!.failing.map((f) => f.code)).toContain("DISCOUNT_ABOVE_LIMIT");
  });

  it("converts an amount the buyer gave excluding GST before checking it, and says what it checked", async () => {
    await sentWithRequest();
    const view = await svc.corridorFor({ requestedPaise: 3_000_000, gstBasis: "excluding" });
    expect(view.gstBasis).toBe("excluding");
    expect(view.requestedTotalPaise).toBe(3_540_000); // ₹30,000 + 18% GST
    expect(Math.abs(view.check!.totalPaise - 3_540_000)).toBeLessThanOrEqual(2);
  });

  it("refuses an amount excluding GST that is not lower once GST is added: ₹40,000 + GST is ₹47,200", async () => {
    await sentWithRequest();
    await expect(svc.corridorFor({ requestedPaise: 4_000_000, gstBasis: "excluding" })).rejects.toThrow(/lower than the current offer/i);
  });

  it("will not guess the GST basis", async () => {
    await sentWithRequest();
    await expect(svc.corridorFor({ requestedPaise: 4_000_000 })).rejects.toThrow(/includes GST/i);
  });

  it("is refused for a request that is not about the price, and changes nothing", async () => {
    await sentWithRequest("date");
    const before = await svc.getState();
    await expect(svc.corridorFor({})).rejects.toThrow(/not about the price/i);
    expect(await svc.getState()).toEqual(before);
  });

  it("is read-only", async () => {
    await sentWithRequest();
    const before = await svc.getState();
    await svc.corridorFor({ requestedPaise: 4_000_000, gstBasis: "including" });
    expect(await svc.getState()).toEqual(before);
  });
});

describe("with the illustrative economics: a 10% ceiling and 0%, 5%, 10% approved", () => {
  it("shows a row for each approved level, each meeting every rule, lower discount first", async () => {
    await activateIllustrative();
    await sentWithRequest();
    const view = await svc.corridorFor({});
    expect(view.ladder.map((r) => r.discountBps)).toEqual([0, 500, 1000]);
    expect(view.ladder.every((r) => r.passes)).toBe(true);
    expect(view.ladder.map((r) => r.totalPaise)).toEqual([...view.ladder.map((r) => r.totalPaise)].sort((a, b) => b - a));
    expect(view.ladder[0]).toMatchObject({ isCurrent: true, totalPaise: CURRENT });
    expect(new Set(view.ladder.map((r) => r.structureId)).size).toBe(3);
  });

  it("finds a lowest compliant total about 10% under the current offer", async () => {
    await activateIllustrative();
    await sentWithRequest();
    const view = await svc.corridorFor({});
    expect(Math.abs(view.lowestCompliantPaise! - 4_141_800)).toBeLessThanOrEqual(100);
  });

  it("checks a request for the lowest total as passing every rule, so it needs no override", async () => {
    await activateIllustrative();
    await sentWithRequest();
    const view = await svc.corridorFor({ requestedPaise: 4_200_000, gstBasis: "including" });
    expect(view.check).toMatchObject({ passes: true, negativeContribution: false });
  });
});

describe("answering with an offer the engine already approved", () => {
  it("withdraws the sent version and selects that offer, with no override, ready for the usual preview", async () => {
    await activateIllustrative();
    const sent = await sentWithRequest();
    const five = (await svc.corridorFor({})).ladder.find((r) => r.discountBps === 500)!;
    const s = await svc.answerWithOffer(five.structureId);
    expect(s.status).toBe("options_ready");
    expect(s.agreements.find((v) => v.version === sent.version)!.status).toBe("superseded");
    expect(s.selectedOption).toMatchObject({ structureId: five.structureId, explicit: true });
    expect(s.counterOffers.at(-1)).toMatchObject({ source: "listed_offer", override: null, fromVersion: sent.version });
    expect(await svc.progressOf(s)).toMatchObject({ stage: "offer", rule: "offer.review" });
    const draft = await svc.reviewBuyerProposal();
    expect(draft).toMatchObject({ version: sent.version + 1, supersedes: sent.version, structureId: five.structureId });
    expect(draft.terms.pricing.totalPaise).toBe(five.totalPaise);
  });

  it("records the buyer's request as answered with a different offer only once that offer is delivered", async () => {
    await activateIllustrative();
    await sentWithRequest();
    const ten = (await svc.corridorFor({})).ladder.find((r) => r.discountBps === 1000)!;
    const prepared = await svc.answerWithOffer(ten.structureId);
    const requestId = prepared.counterOffers.at(-1)!.requestMessageId;
    expect(prepared.workDispositions.some((d) => d.sourceId === requestId)).toBe(false);
    const draft = await svc.reviewBuyerProposal();
    await svc.approveDraft(draft.version, draft.termsHash);
    await svc.sendProposal(draft.version);
    const s = await svc.getState();
    expect(s.workDispositions.at(-1)).toMatchObject({ kind: "answered_with_offer", sourceId: requestId });
  });

  it("keeps the engine's own list of recommended offers intact: the discounted offer is not in it, and the leader is unchanged", async () => {
    await activateIllustrative();
    await sentWithRequest();
    const ten = (await svc.corridorFor({})).ladder.find((r) => r.discountBps === 1000)!;
    const s = await svc.answerWithOffer(ten.structureId);
    const view = svc.strategyViewOf(s, await svc.currentOutcome(s));
    expect(view.ranked.map((x) => x.structure.id)).not.toContain(ten.structureId);
    expect(view.leader!.structure.id).toBe(TWO_PAYMENTS);
  });

  it("offers a timing alternative the same way", async () => {
    await sentWithRequest();
    const s = await svc.answerWithOffer(UPFRONT);
    expect(s.selectedOption).toMatchObject({ structureId: UPFRONT, explicit: true });
  });

  it.each([
    ["an offer that is not available", "split_payment:plan=nope", /not available/i],
    ["the offer that was already sent", TWO_PAYMENTS, /already sent/i],
  ])("refuses %s, and changes nothing", async (_n, id, message) => {
    await sentWithRequest();
    const before = await svc.getState();
    await expect(svc.answerWithOffer(id)).rejects.toThrow(message);
    expect(await svc.getState()).toEqual(before);
  });

  it("is refused for a request that is not about the price", async () => {
    await sentWithRequest("date");
    await expect(svc.answerWithOffer(UPFRONT)).rejects.toThrow(/not about the price/i);
  });
});
