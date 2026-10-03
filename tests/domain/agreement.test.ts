import { describe, expect, it } from "vitest";
import {
  activate,
  AgreementError,
  assertPaymentsUnlocked,
  buyerAccept,
  canonicalJson,
  createAgreementVersion,
  markSent,
  merchantApprove,
  termsHash,
  type AgreementVersion,
} from "@/domain/agreement";
import { FixedClock } from "@/domain/clock";
import { enumerateAndEvaluate } from "@/domain/engine";
import { interpretations } from "@/domain/constraints";
import { rescheduleLine } from "@/domain/amendment";
import { heroBuyer, heroMerchant, HERO_DEAL_ID } from "@/data/synthetic/hero";
import { clarifiedHeroProfile, heroInput } from "../helpers";

const clock = new FixedClock("2026-10-01T09:30:00+05:30");
const result = enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput());
const top = result.feasible[0];
const make = (evaluated = top, version = 1) =>
  createAgreementVersion({ agreementId: "agr-1", version, evaluated, dealId: HERO_DEAL_ID, merchantId: heroMerchant.id, buyerId: heroBuyer.id, policy: heroMerchant.policy, clock });

describe("canonical agreement hashing", () => {
  it("is stable across runs and independent of key order", () => {
    const a = make();
    const b = make();
    expect(a.termsHash).toBe(b.termsHash);
    expect(a.termsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it("excludes mutable metadata (creation time, status, run time)", () => {
    const later = createAgreementVersion({ agreementId: "agr-1", version: 1, evaluated: top, dealId: HERO_DEAL_ID, merchantId: heroMerchant.id, buyerId: heroBuyer.id, policy: heroMerchant.policy, clock: new FixedClock("2027-01-01T00:00:00+05:30") });
    expect(later.termsHash).toBe(make().termsHash);
    expect(canonicalJson(make().terms)).not.toMatch(/createdAt|status|runId/);
  });

  it("includes currency, schema version, precision-tagged dates, paise amounts and mandate terms", () => {
    const t = make().terms;
    expect(t.currency).toBe("INR");
    expect(t.schemaVersion).toBe("adaptive-deals.terms.v1");
    expect(t.paymentSchedule[0].dueDate).toEqual({ value: "2026-11-01", precision: "day" });
    expect(t.deliverySchedule[0].month.precision).toBe("month");
    expect(t.mandate).toEqual({ perDebitLimitPaise: 2_301_000, endDate: { value: "2027-01-31", precision: "day" } });
  });

  it("changes when any contractual term changes", () => {
    const base = make();
    const moved = { ...top, structure: rescheduleLine(top.structure, "pay-2", "2026-12-21") };
    expect(make(moved).termsHash).not.toBe(base.termsHash);
    const tweaked = structuredClone(base.terms);
    tweaked.paymentSchedule[1].totalPaise += 1;
    expect(termsHash(tweaked)).not.toBe(base.termsHash);
  });

  it("refuses to create an agreement from a rejected or undecidable structure", () => {
    expect(() => make(result.rejected[0])).toThrow(AgreementError);
    expect(() => make(result.needsInformation[0])).toThrow(AgreementError);
  });
});

describe("merchant approval and buyer acceptance must carry the same hash", () => {
  const flow = (): AgreementVersion => {
    const v = make();
    return buyerAccept(markSent(merchantApprove(v, v.termsHash, "merchant", clock)), v.termsHash, "buyer", clock, { authorityConfirmed: true });
  };

  it("activates only when both signatures match the stored terms hash", () => {
    const active = activate(flow());
    expect(active.status).toBe("active");
    expect(active.merchantApproval!.termsHash).toBe(active.buyerAcceptance!.termsHash);
    expect(() => assertPaymentsUnlocked(active)).not.toThrow();
  });

  it("rejects approval or acceptance against a different hash", () => {
    const v = make();
    expect(() => merchantApprove(v, "0".repeat(64), "merchant", clock)).toThrow(/does not match/);
    const sent = markSent(merchantApprove(v, v.termsHash, "merchant", clock));
    expect(() => buyerAccept(sent, "f".repeat(64), "buyer", clock, { authorityConfirmed: true })).toThrow(/does not match/);
  });

  it("detects terms altered after approval", () => {
    const accepted = flow();
    const tampered = { ...accepted, terms: { ...accepted.terms, pricing: { ...accepted.terms.pricing, prePaise: 1 } } };
    expect(() => activate(tampered)).toThrow(/same terms hash/);
    expect(() => assertPaymentsUnlocked(tampered)).toThrow();
  });

  it("blocks payment actions before acceptance", () => {
    const v = make();
    expect(() => assertPaymentsUnlocked(merchantApprove(v, v.termsHash, "merchant", clock))).toThrow(/matching/);
  });

  it("requires the buyer to confirm authority for a phase scope", () => {
    const v = make();
    const sent = markSent(merchantApprove(v, v.termsHash, "merchant", clock));
    expect(v.terms.conditions).toContain("buyer_confirms_authority_for_phase_scope");
    expect(() => buyerAccept(sent, v.termsHash, "buyer", clock, { authorityConfirmed: false })).toThrow(/authority/);
  });

  it("preserves the engine's required-approval condition in canonical terms and acceptance", () => {
    const evaluated = result.feasible.find((x) => x.approval === "requires_approval")!;
    const v = make(evaluated);
    expect(v.terms.conditions).toContain("buyer_attests_required_approval");
    const sent = markSent(merchantApprove(v, v.termsHash, "merchant", clock));
    expect(() => buyerAccept(sent, v.termsHash, "buyer", clock, { authorityConfirmed: false })).toThrow(/required internal approval/);
  });

  it("does not add the MD-attestation condition to a within-limit option", () => {
    expect(make(result.feasible.find((x) => x.approval === "within_limit")!).terms.conditions).not.toContain("buyer_attests_required_approval");
  });
});
