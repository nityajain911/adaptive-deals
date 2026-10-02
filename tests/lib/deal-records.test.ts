import { describe, expect, it } from "vitest";
import { buildCanonicalTerms, deriveMandateTerms } from "@/domain/agreement";
import { interpretations } from "@/domain/constraints";
import { enumerateAndEvaluate } from "@/domain/engine";
import { heroMerchant } from "@/data/synthetic/hero";
import { BUYER_DECLINE_REASONS, decisionFingerprint, deliveryKey, isDelivered, MERCHANT_CLOSE_REASONS } from "@/lib/deal-records";
import { clarifiedHeroProfile, heroInput } from "../helpers";

const result = () => enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput());
const termsOf = (i: number) => {
  const x = result().feasible[i];
  return buildCanonicalTerms({ dealId: "d", merchantId: "m", buyerId: "b", structure: x.structure, gstRateBps: 1800, mandate: deriveMandateTerms(x.structure, heroMerchant.policy) });
};

describe("decision fingerprint (spec §3.2)", () => {
  const ids = result().structures.filter((x) => x.approvable).map((x) => x.structure.id);
  it("is deterministic and ignores display order", () => {
    expect(decisionFingerprint(ids, termsOf(0))).toBe(decisionFingerprint([...ids].reverse(), termsOf(0)));
  });
  it("changes when the eligible set or the selected terms change", () => {
    expect(decisionFingerprint(ids.slice(1), termsOf(0))).not.toBe(decisionFingerprint(ids, termsOf(0)));
    expect(decisionFingerprint(ids, termsOf(1))).not.toBe(decisionFingerprint(ids, termsOf(0)));
  });
});

describe("reason codes are stable and separate from labels (spec §5.7)", () => {
  it("lists the approved merchant codes", () => {
    expect(Object.keys(MERCHANT_CLOSE_REASONS)).toEqual(["contribution_too_low", "scope_not_worth_delivering", "buyer_unlikely", "handled_elsewhere", "other"]);
    expect(MERCHANT_CLOSE_REASONS.handled_elsewhere).toBe("Will handle outside Adaptive Deals");
  });
  it("has buyer decline codes", () => {
    expect(Object.keys(BUYER_DECLINE_REASONS).length).toBeGreaterThan(1);
  });
});

describe("delivery identity", () => {
  it("one stable key per version; delivered only with a successful attempt", () => {
    expect(deliveryKey("agr-hero", 1)).toBe(deliveryKey("agr-hero", 1));
    expect(deliveryKey("agr-hero", 1)).not.toBe(deliveryKey("agr-hero", 2));
    const rec = { version: 1, idempotencyKey: deliveryKey("agr-hero", 1), kind: "proposal" as const, attempts: [{ attemptId: "a1", at: "t", status: "failed" as const, failureReason: "x" }], deliveredAt: null, reference: null };
    expect(isDelivered([rec], 1)).toBe(false);
    expect(isDelivered([{ ...rec, deliveredAt: "t2", reference: "r" }], 1)).toBe(true);
  });
});
