import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { driveTo, reviewTwoPayments } from "../helpers/drive";

/**
 * A failed-rule exception is the merchant sending an amount the engine reported as failing a rule.
 * It needs a reason, an acknowledgement of exactly the rules shown, and, if the amount is below
 * direct costs, nothing more than a recorded reason. The engine's result is never changed.
 */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-exceptions-"));
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

const ASK = 4_000_000; // below the current offer, above direct costs
const LOSS = 500_000; // ₹5,000: below the direct cost of the work
const REASON = "The buyer pays on time and orders often";

beforeEach(async () => {
  await store.resetEconomicsStore();
});

async function sentWithRequest() {
  await svc.resetToSeed();
  await presenter.setFailNextSend(false);
  await driveTo(svc, (s) => s.status === "options_ready");
  const d = await reviewTwoPayments(svc);
  await svc.approveDraft(d.version, d.termsHash);
  await svc.sendProposal(d.version);
  await svc.requestChange(d.version, "Could you do a lower total?", "price");
  return d;
}
const codesFor = async (total: number) => (await svc.checkCounterOffer(total)).failing.map((f) => f.code);

describe("the reason", () => {
  it.each([["no reason", ""], ["only spaces", "      "], ["a one-word reason", "ok"]])("is required for a failing amount: %s", async (_n, reason) => {
    await sentWithRequest();
    const before = await svc.getState();
    await expect(svc.makeCounterOffer(ASK, true, await codesFor(ASK), { reason })).rejects.toThrow(/reason/i);
    await expect(svc.makeCounterOffer(ASK, true, await codesFor(ASK))).rejects.toThrow(/reason/i);
    expect(await svc.getState()).toEqual(before);
  });

  it("is stored with the override, beside who made it, when, and the rules overridden", async () => {
    await sentWithRequest();
    const s = await svc.makeCounterOffer(ASK, true, await codesFor(ASK), { reason: `  ${REASON}  ` });
    expect(s.counterOffers.at(-1)!.override).toMatchObject({ by: "Merchant (Pinecone Media Works)", reason: REASON, negativeContribution: false, checks: expect.arrayContaining(["DISCOUNT_ABOVE_LIMIT"]) });
  });

  it("is limited in length", async () => {
    await sentWithRequest();
    await expect(svc.makeCounterOffer(ASK, true, await codesFor(ASK), { reason: "x".repeat(301) })).rejects.toThrow(/300/);
  });
});

describe("an amount below direct costs", () => {
  it("is flagged by the check, and needs only the merchant's reason, which is recorded with the loss", async () => {
    await sentWithRequest();
    const check = await svc.checkCounterOffer(LOSS);
    expect(check.contributionPaise).toBeLessThan(0);
    expect(check.negativeContribution).toBe(true);
    const codes = check.failing.map((f) => f.code);
    // No reason, no counter-offer.
    await expect(svc.makeCounterOffer(LOSS, true, codes, { reason: "" })).rejects.toThrow(/short reason/i);
    await expect(svc.makeCounterOffer(LOSS, true, codes, { reason: "ok" })).rejects.toThrow(/short reason/i);
    expect((await svc.getState()).counterOffers).toEqual([]);
    const s = await svc.makeCounterOffer(LOSS, true, codes, { reason: REASON });
    const counter = s.counterOffers.at(-1)!;
    expect(counter.override).toMatchObject({ reason: REASON, negativeContribution: true });
    // The engine's own result is untouched.
    expect(counter.evaluated.approvable).toBe(false);
    expect(counter.evaluated.economics.netContributionPaise).toBeLessThan(0);
  });

  it("is no different for an amount that still covers direct costs: a reason is all it takes", async () => {
    await sentWithRequest();
    expect((await svc.checkCounterOffer(ASK)).negativeContribution).toBe(false);
    await expect(svc.makeCounterOffer(ASK, true, await codesFor(ASK), { reason: REASON })).resolves.toBeTruthy();
  });

  it("still counts as an exception when no rule fails, because the merchant's economics have no floor to catch a loss", async () => {
    const draft = (await import("@/lib/economics-default")).defaultEconomicsContent();
    draft.guardrails.contributionFloor = { minPercentBps: null, minPaise: null, combine: "both" };
    draft.guardrails.discountLimitBps = 10_000;
    // Relax the other limits too, so that a loss is the only thing wrong with this amount.
    draft.guardrails.cashAtRiskLimitPaise = 10_000_000;
    draft.guardrails.smallestInstalmentPaise = 100;
    await store.saveEconomicsDraft(draft);
    await store.activateEconomicsDraft("Merchant (Pinecone Media Works)", "2026-10-06T10:00:00+05:30");
    await sentWithRequest();
    const check = await svc.checkCounterOffer(LOSS);
    expect(check.contributionPaise).toBeLessThan(0);
    expect(check.failing).toEqual([]);
    expect(check.negativeContribution).toBe(true);
    await expect(svc.makeCounterOffer(LOSS, false, [], { reason: REASON })).rejects.toThrow(/override/i);
    await expect(svc.makeCounterOffer(LOSS, true, [], { reason: "" })).rejects.toThrow(/short reason/i);
    const s = await svc.makeCounterOffer(LOSS, true, [], { reason: REASON });
    expect(s.counterOffers.at(-1)!.override).toMatchObject({ negativeContribution: true, checks: [] });
  });
});

describe("the audit of the merchant's exceptions and overrides", () => {
  it("lists input overrides and failed-rule exceptions separately, each with who, when, why and the economics version", async () => {
    await svc.resetToSeed();
    await presenter.setFailNextSend(false);
    await driveTo(svc, (s) => s.status === "options_ready");
    await svc.addInputOverride({ field: "cash_exposure", value: 2_000_000, reason: "Client pays a deposit first" });
    const d = await reviewTwoPayments(svc);
    await svc.approveDraft(d.version, d.termsHash);
    await svc.sendProposal(d.version);
    await svc.requestChange(d.version, "Could you do a lower total?", "price");
    const s = await svc.makeCounterOffer(ASK, true, await codesFor(ASK), { reason: REASON });

    const { merchantExceptions } = await import("@/lib/audit");
    const audit = merchantExceptions(s);
    expect(audit.inputOverrides).toEqual([
      expect.objectContaining({ what: "Most I'll spend before I'm paid: ₹10,000 → ₹20,000", direction: "Loosens your account rule", reason: "Client pays a deposit first", by: "Merchant (Pinecone Media Works)", economicsVersion: 1 }),
    ]);
    expect(audit.failedRuleExceptions).toEqual([
      expect.objectContaining({ total: expect.stringMatching(/^₹40,0/), rules: [expect.stringMatching(/Discount .* above your 0% limit/)], reason: REASON, by: "Merchant (Pinecone Media Works)", negativeContribution: false, economicsVersion: 1 }),
    ]);
    expect(audit.inputOverrides.concat(audit.failedRuleExceptions as never).every((e) => /^\d{4}-\d{2}-\d{2}T/.test(e.at))).toBe(true);
  });

  it("says plainly when there are none", async () => {
    await svc.resetToSeed();
    const { merchantExceptions } = await import("@/lib/audit");
    expect(merchantExceptions(await svc.getState())).toEqual({ inputOverrides: [], failedRuleExceptions: [], history: [] });
  });

  it("keeps removed and replaced overrides in its history, so nothing the merchant did disappears", async () => {
    await svc.resetToSeed();
    await driveTo(svc, (s) => s.status === "options_ready");
    await svc.addInputOverride({ field: "cash_exposure", value: 2_000_000, reason: "First reason" });
    await svc.addInputOverride({ field: "cash_exposure", value: 3_000_000, reason: "Second reason" });
    const s = await svc.removeInputOverride((await svc.getState()).economics.overrides[0].id);
    const { merchantExceptions } = await import("@/lib/audit");
    const audit = merchantExceptions(s);
    expect(audit.inputOverrides).toEqual([]);
    expect(audit.history.map((h) => h.title)).toEqual(expect.arrayContaining([expect.stringMatching(/replaced/i), expect.stringMatching(/removed/i)]));
    expect(JSON.stringify(audit.history)).toMatch(/First reason/);
  });
});
