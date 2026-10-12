import { describe, expect, it } from "vitest";
import { interpretExtraction } from "@/ai/extract";
import { createAgreementVersion, termsHash } from "@/domain/agreement";
import { FixedClock } from "@/domain/clock";
import { interpretations } from "@/domain/constraints";
import { proposalMessageText } from "@/domain/conversation";
import { enumerateAndEvaluate, type EngineInput } from "@/domain/engine";
import { canonicalFollowOn, deriveFollowOn, heldOfferSentence } from "@/domain/follow-on";
import { demoCase } from "@/data/synthetic/cases";
import { proposalView } from "@/lib/views";
import { clarifiedHeroProfile, heroInput } from "../helpers";

/**
 * The rest of the year, held at today's rates after a smaller first phase. It is worked out by the same engine, it is part of the
 * terms both sides approve, and it is never promised when the engine would reject it.
 */
const TWO_MONTHLY = "phased_scope:scope=web-search-report-3m,plan=two_monthly";

function harbour() {
  const item = demoCase("reduced-scope")!;
  const { profile } = interpretExtraction(item.expected.extraction, { dealId: item.deal.dealId, messages: item.deal.messages, packages: item.deal.packages, timeZone: item.deal.merchant.timeZone });
  // The buyer's two clarification answers, as the demo records them.
  const constraints = { ...interpretations(profile)[0].constraints, amountsIncludeGst: "yes" as const, approvalScope: "per_contract" as const };
  const input: EngineInput = { merchant: item.deal.merchant, packages: item.deal.packages, templates: item.deal.templates };
  const all = enumerateAndEvaluate(constraints, input);
  return { item, constraints, input, all, phase: all.structures.find((x) => x.structure.id === TWO_MONTHLY)! };
}

describe("the rest of the year, held after a first phase", () => {
  it("is the remaining scope at today's rates, in the payments the merchant's own rules allow", () => {
    const { constraints, input, phase } = harbour();
    const held = deriveFollowOn(phase, constraints, input)!;
    expect(held).toMatchObject({
      startDate: "2027-02-01",
      reviewDate: "2027-02-01",
      heldUntil: "2027-03-18",
      prePaise: 7_200_000,
      gstPaise: 1_296_000,
      totalPaise: 8_496_000,
      approval: "requires_approval",
    });
    // Nine months each of search, social and reporting; the website fixes were delivered in the first phase.
    expect(held.scope).toEqual([
      { packageId: "search-marketing", months: 9 },
      { packageId: "social-media", months: 9 },
      { packageId: "monthly-reporting", months: 9 },
    ]);
    // Nine ₹8,000 payments would fall below the smallest instalment the merchant allows, so the engine's own check chooses three.
    expect(held.instalments).toBe(3);
    expect(held.netContributionPaise).toBe(3_655_080);
  });

  it("is checked by the engine: nothing is held when the rest of the year would break the merchant's own floor", () => {
    const { constraints, input, phase } = harbour();
    const strict = structuredClone(input);
    strict.merchant.policy.contributionFloor = { minPercentBps: 6000, minPaise: null, combine: "both" };
    expect(deriveFollowOn(phase, constraints, strict)).toBeNull();
  });

  it("is held only for a first-phase offer, never for a full-scope plan", () => {
    const { constraints, input, all } = harbour();
    const full = all.structures.filter((x) => x.structure.scopeKind !== "phase_1");
    expect(full.length).toBeGreaterThan(0);
    for (const x of full) expect(deriveFollowOn(x, constraints, input)).toBeNull();
  });

  it("is not held when the buyer has no budget for the payments it would need", () => {
    // In the earlier fixture the buyer's next budget opens in April, so the payments from 1 Feb would fall in their gap.
    const input = heroInput();
    const constraints = interpretations(clarifiedHeroProfile())[0].constraints;
    const phase = enumerateAndEvaluate(constraints, input).structures.find((x) => x.structure.id === TWO_MONTHLY)!;
    expect(deriveFollowOn(phase, constraints, input)).toBeNull();
  });

  it("goes into the terms both sides approve: it changes the hash, carries no internal economics, and a revision keeps it", () => {
    const { item, constraints, input, phase } = harbour();
    const clock = new FixedClock();
    const base = { agreementId: "agr-test", version: 1, evaluated: phase, dealId: item.deal.dealId, merchantId: item.deal.merchant.id, buyerId: item.buyer.id, policy: item.deal.merchant.policy, clock };
    const without = createAgreementVersion(base);
    const held = canonicalFollowOn(deriveFollowOn(phase, constraints, input)!);
    const withHeld = createAgreementVersion({ ...base, followOn: held });
    expect(withHeld.termsHash).not.toBe(without.termsHash);
    expect(without.terms.followOn).toBeUndefined();
    expect(JSON.stringify(withHeld.terms.followOn)).not.toMatch(/contribution/i);
    // Changing the date it is held until is a different set of terms.
    const later = createAgreementVersion({ ...base, followOn: { ...held, heldUntil: "2027-04-01" } });
    expect(later.termsHash).not.toBe(withHeld.termsHash);
    expect(termsHash(withHeld.terms)).toBe(withHeld.termsHash);
    // A revision that is handed the earlier terms' held offer keeps it unchanged.
    const revision = createAgreementVersion({ ...base, version: 2, supersedes: 1, followOn: withHeld.terms.followOn ?? null });
    expect(revision.terms.followOn).toEqual(withHeld.terms.followOn);
  });

  it("is said once, in the same words, in the message and on the proposal", () => {
    const { item, constraints, input, phase } = harbour();
    const held = canonicalFollowOn(deriveFollowOn(phase, constraints, input)!);
    const v = createAgreementVersion({ agreementId: "agr-test", version: 1, evaluated: phase, dealId: item.deal.dealId, merchantId: item.deal.merchant.id, buyerId: item.buyer.id, policy: item.deal.merchant.policy, clock: new FixedClock(), followOn: held });
    const sentence = "The rest of the year (₹84,960 including GST) stays open at today's rates until 18 Mar 2027.";
    expect(heldOfferSentence(held)).toBe(sentence);
    expect(proposalMessageText(v.terms, 1, "https://example.test/p")).toContain(sentence);
    expect(proposalView(v, input.packages, input.merchant.policy).heldOffer).toBe(sentence);
    // Without it, nothing is added to the message or the proposal.
    const plain = createAgreementVersion({ agreementId: "agr-test", version: 1, evaluated: phase, dealId: item.deal.dealId, merchantId: item.deal.merchant.id, buyerId: item.buyer.id, policy: item.deal.merchant.policy, clock: new FixedClock() });
    expect(proposalMessageText(plain.terms, 1, "https://example.test/p")).not.toContain("rest of the year");
    expect(proposalView(plain, input.packages, input.merchant.policy).heldOffer).toBeNull();
  });
});
