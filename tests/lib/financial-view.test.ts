import { describe, expect, it } from "vitest";
import { createAgreementVersion, type AgreementVersion } from "@/domain/agreement";
import { FixedClock } from "@/domain/clock";
import type { CollectionAttempt } from "@/domain/collections";
import { interpretations } from "@/domain/constraints";
import { enumerateAndEvaluate } from "@/domain/engine";
import { heroBuyer, heroMerchant, HERO_DEAL_ID } from "@/data/synthetic/hero";
import { contractFinancialView } from "@/lib/financial-view";
import { clarifiedHeroProfile, heroInput } from "../helpers";

const options = enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput()).feasible;
const phase = options.find((x) => x.structure.template === "phased_scope" && x.structure.payments.length === 2)!;
const annual = options.find((x) => x.structure.scopeKind === "full" && x.structure.payments.length === 2)!;
const deferred = options.find((x) => x.structure.template === "deferred_start")!;
const agreement = (evaluated: (typeof options)[number], status: AgreementVersion["status"]): AgreementVersion => {
  const v = createAgreementVersion({ agreementId: "agr", version: 1, evaluated, dealId: HERO_DEAL_ID, merchantId: heroMerchant.id, buyerId: heroBuyer.id, policy: heroMerchant.policy, clock: new FixedClock() });
  return { ...v, status, buyerAcceptance: status === "active" ? { by: "buyer", at: v.createdAt, termsHash: v.termsHash, authorityConfirmed: true } : null };
};
const paid = (v: AgreementVersion, line: AgreementVersion["terms"]["paymentSchedule"][number], at: string): CollectionAttempt => ({
  id: `att-${line.id}-${at}`,
  agreementId: v.agreementId,
  agreementVersion: v.version,
  scheduleLineId: line.id,
  dueDate: line.dueDate.value,
  amountPaise: line.totalPaise,
  prePaise: line.prePaise,
  gstPaise: line.gstPaise,
  idempotencyKey: `key-${line.id}-${at}`,
  status: "succeeded",
  origin: "agreement",
  method: line.method as CollectionAttempt["method"],
  razorpayId: null,
  history: [{ at, status: "succeeded", note: "verified" }],
});
const view = (v: AgreementVersion, attempts: CollectionAttempt[], now = "2026-11-02T10:00:00+05:30") => contractFinancialView({ agreement: v, attempts, eligibleAt: "2026-10-01T09:00:00+05:30", now });

describe("contract financial presentation", () => {
  it("keeps an unaccepted proposal historical and creates no operational balance", () => {
    const x = view(agreement(phase, "sent"), []);
    expect(x).toMatchObject({ state: "proposed", remainingPaise: null, remainingGstPaise: null, stateLabel: "Proposed schedule · no accepted contract recorded" });
  });
  it("labels a declined proposal without implying an amount is owed", () => {
    const x = view(agreement(phase, "buyer_rejected"), []);
    expect(x).toMatchObject({ state: "declined", remainingPaise: null, stateLabel: "No accepted contract recorded in Adaptive Deals" });
  });
  it("separates collected and remaining amounts after the first phase payment", () => {
    const v = agreement(phase, "active");
    const x = view(v, [paid(v, v.terms.paymentSchedule[0], "2026-11-01T10:00:00+05:30")]);
    expect(x).toMatchObject({ state: "accepted", contractTotalPaise: 4_602_000, collectedPaise: 2_301_000, remainingPaise: 2_301_000, collectedPrePaise: 1_950_000, collectedGstPaise: 351_000 });
  });
  it("shows full operational collections separately from receipts inside the 90-day window", () => {
    const v = agreement(annual, "active");
    const attempts = [paid(v, v.terms.paymentSchedule[0], "2026-11-01T10:00:00+05:30"), paid(v, v.terms.paymentSchedule[1], "2027-05-01T10:00:00+05:30")];
    const x = view(v, attempts, "2027-05-02T10:00:00+05:30");
    expect(x).toMatchObject({ collectedPaise: 14_160_000, remainingPaise: 0, windowedCollectedPaise: 4_248_000, cutoff: "2026-12-30T09:00:00+05:30" });
  });
  it("explains a deferred receipt that is operationally collected but outside the window", () => {
    const v = agreement(deferred, "active");
    const first = v.terms.paymentSchedule[0];
    const x = view(v, [paid(v, first, "2027-05-01T10:00:00+05:30")], "2027-05-02T10:00:00+05:30");
    expect(x).toMatchObject({ collectedPaise: 1_180_000, windowedCollectedPaise: 0, cutoff: "2026-12-30T09:00:00+05:30" });
    expect(x.windowExplanation).toMatch(/after the 90-day cutoff/);
  });
});
