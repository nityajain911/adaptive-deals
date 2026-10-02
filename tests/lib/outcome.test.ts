import { describe, expect, it } from "vitest";
import { createAgreementVersion, type AgreementVersion } from "@/domain/agreement";
import { FixedClock } from "@/domain/clock";
import type { CollectionAttempt } from "@/domain/collections";
import { interpretations } from "@/domain/constraints";
import { enumerateAndEvaluate } from "@/domain/engine";
import { sum } from "@/domain/money";
import { heroBuyer, heroMerchant, HERO_DEAL_ID } from "@/data/synthetic/hero";
import { measurementCutoff, outcomeSummary } from "@/lib/outcome";
import type { DemoState } from "@/lib/service";
import { clarifiedHeroProfile, heroInput } from "../helpers";

const evaluated = () => enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput()).feasible;
const heroTop = () => evaluated().find((x) => x.structure.template === "phased_scope" && x.structure.payments.length === 2)!;

function version(n: number, index: number, status: AgreementVersion["status"]): AgreementVersion {
  const v = createAgreementVersion({
    agreementId: "agr-outcome",
    version: n,
    evaluated: evaluated()[index],
    dealId: HERO_DEAL_ID,
    merchantId: heroMerchant.id,
    buyerId: heroBuyer.id,
    policy: heroMerchant.policy,
    clock: new FixedClock(),
    supersedes: n > 1 ? n - 1 : null,
  });
  return {
    ...v,
    status,
    buyerAcceptance:
      status === "accepted" || status === "active" || status === "superseded"
        ? { by: heroBuyer.name, at: "2026-10-01T09:30:00+05:30", termsHash: v.termsHash, authorityConfirmed: true }
        : null,
  };
}

function attempt(id: string, succeededAt: string, prePaise = 100_000, totalPaise = 118_000): CollectionAttempt {
  return {
    id,
    agreementId: "agr-outcome",
    agreementVersion: 1,
    scheduleLineId: id,
    dueDate: succeededAt.slice(0, 10),
    amountPaise: totalPaise,
    prePaise,
    gstPaise: totalPaise - prePaise,
    idempotencyKey: `key-${id}`,
    status: "succeeded",
    origin: "agreement",
    method: "payment_link",
    razorpayId: `pay-${id}`,
    history: [
      { at: "2026-10-01T09:00:00+05:30", status: "scheduled", note: "test" },
      { at: succeededAt, status: "succeeded", note: "verified payment" },
    ],
  };
}

function state(over: Partial<DemoState> = {}): DemoState {
  return {
    eligibleAt: "2026-10-01T09:00:00+05:30",
    attempts: [],
    agreements: [],
    deliveries: [],
    outcomes: [],
    events: [],
    ...over,
  } as DemoState;
}

describe("outcome metric (spec §7.2)", () => {
  it("uses eligibleAt as the exact 90-day window", () => {
    expect(measurementCutoff("2026-10-01T09:00:00+05:30", "2026-11-01T10:00:00+05:30")).toEqual({
      cutoff: "2026-11-01T10:00:00+05:30",
      windowEnded: false,
    });
    expect(measurementCutoff("2026-10-01T09:00:00+05:30", "2027-02-01T10:00:00+05:30")).toEqual({
      cutoff: "2026-12-30T09:00:00+05:30",
      windowEnded: true,
    });
  });

  it("includes a payment before the cutoff instant and excludes one later on the same date", () => {
    const before = attempt("before", "2026-12-30T08:59:59+05:30");
    const after = attempt("after", "2026-12-30T09:00:01+05:30", 200_000, 236_000);
    const o = outcomeSummary({
      s: state({ attempts: [before, after] }),
      acceptedStructure: null,
      policy: heroMerchant.policy,
      now: "2027-03-01T10:00:00+05:30",
      timeZone: heroMerchant.timeZone,
    });
    expect(o.collected).toEqual({ totalPaise: 118_000, prePaise: 100_000 });
    expect(o.inputs.estimatedFeesPaise).toBe(2_360);
  });

  it("allows incurred costs to make the provisional value negative before cash arrives", () => {
    const top = heroTop().structure;
    const o = outcomeSummary({
      s: state(),
      acceptedStructure: top,
      policy: heroMerchant.policy,
      now: "2026-11-02T10:00:00+05:30",
      timeZone: heroMerchant.timeZone,
    });
    expect(o.inputs.costsIncurredPaise).toBeGreaterThan(0);
    expect(o.provisionalContributionPaise).toBeLessThan(0);
  });

  it("excludes cash and modelled costs after day 90 and reports incomplete inputs", () => {
    const top = heroTop().structure;
    const late = attempt("late", "2027-01-02T10:00:00+05:30", top.pricePaise, sum(top.payments.map((p) => p.totalPaise)));
    const o = outcomeSummary({
      s: state({ attempts: [late] }),
      acceptedStructure: top,
      policy: heroMerchant.policy,
      now: "2027-03-01T10:00:00+05:30",
      timeZone: heroMerchant.timeZone,
    });
    expect(o.inputs.cutoff).toBe("2026-12-30T09:00:00+05:30");
    expect(o.collected.totalPaise).toBe(0);
    expect(o.inputs.costsIncurredPaise).toBeLessThan(top.directCostPaise);
    expect(o.label).toBe("Window ended · incomplete inputs");
    expect(o.data).toBe("incomplete");
  });

  it("keeps the first delivered proposal distinct from the latest accepted contract", () => {
    const initial = version(1, 0, "superseded");
    const currentIndex = evaluated().findIndex((x) => x.structure.scopeKind === "full");
    expect(currentIndex).toBeGreaterThanOrEqual(0);
    const current = version(2, currentIndex, "active");
    expect(initial.terms.pricing.totalPaise).not.toBe(current.terms.pricing.totalPaise);
    const o = outcomeSummary({
      s: state({
        agreements: [initial, current],
        deliveries: [
          {
            version: 1,
            idempotencyKey: "delivery-v1",
            kind: "proposal",
            attempts: [{ attemptId: "a1", at: initial.createdAt, status: "sent", failureReason: null }],
            deliveredAt: initial.createdAt,
            reference: "conv-1",
          },
        ],
      }),
      acceptedStructure: evaluated()[currentIndex].structure,
      policy: heroMerchant.policy,
      now: "2026-11-02T10:00:00+05:30",
      timeZone: heroMerchant.timeZone,
    });
    expect(o.proposedTotalPaise).toBe(initial.terms.pricing.totalPaise);
    expect(o.acceptedTotalPaise).toBe(current.terms.pricing.totalPaise);
  });

  it("discloses missing refunds, estimated fees and unmodelled committed costs", () => {
    const o = outcomeSummary({
      s: state(),
      acceptedStructure: heroTop().structure,
      policy: heroMerchant.policy,
      now: "2026-11-02T10:00:00+05:30",
      timeZone: heroMerchant.timeZone,
    });
    expect(o.disclosures).toEqual([
      "Refund data is not modelled in this prototype. No refund amount has been assumed.",
      "Estimated payment fees at configured rate (2%) — not an actual settled Razorpay fee record.",
      "Includes modelled costs incurred up to the measurement cutoff. Irrevocably committed future costs are not modelled.",
    ]);
    expect(JSON.stringify(o)).not.toMatch(/Refunds: ₹0/);
  });
});
