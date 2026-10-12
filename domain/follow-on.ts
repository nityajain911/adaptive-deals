import { addDays, addMonths, compareDates, formatDate, type CalendarDate } from "./dates";
import { evaluateStructure, type ApprovalLabel, type EngineInput, type EvaluatedStructure } from "./engine";
import { isCounterStructureId } from "./counter";
import { formatINR, sum, type Paise } from "./money";
import { buildStructure, type Structure } from "./structures";
import type { BuyerConstraints, PaymentPlan, ScopeItem } from "./types";

/**
 * The rest of the year, held at today's rates after a smaller first phase.
 *
 * A phase-1 offer sells only the first phase. This is what the merchant keeps open for the buyer afterwards: the remaining
 * scope, priced from the same rate card, checked by the same engine, with a review date and a date the price is held until.
 * It is part of the terms both sides approve, so it cannot change after the buyer accepts. It is an option, not a sale:
 * nothing is collected for it, and the buyer decides again at the review.
 *
 * These are the merchant's defaults for this prototype, not yet editable in the prices-and-costs settings.
 */
export const FOLLOW_ON_POLICY = {
  /** The held price stays available this many days after the review. */
  holdDays: 45,
};

export interface FollowOn {
  scope: ScopeItem[];
  startDate: CalendarDate;
  /** The day the buyer and merchant look at the first phase and decide on the rest. */
  reviewDate: CalendarDate;
  /** Today's rates stay available to the buyer until this day. */
  heldUntil: CalendarDate;
  instalments: number;
  /** Months after the start of the rest of the year at which each payment falls, so it can be rebuilt exactly. */
  paymentOffsetsMonths: number[];
  prePaise: Paise;
  gstPaise: Paise;
  totalPaise: Paise;
  approval: ApprovalLabel;
  /** For the merchant only; never part of the terms. */
  netContributionPaise: Paise;
}

/** The part of a follow-on that goes into the agreement's terms: nothing about the merchant's own economics. */
export type CanonicalFollowOn = Omit<FollowOn, "netContributionPaise" | "prePaise" | "gstPaise" | "totalPaise"> & {
  pricing: { prePaise: Paise; gstPaise: Paise; totalPaise: Paise };
};

export const canonicalFollowOn = (f: FollowOn): CanonicalFollowOn => ({
  scope: f.scope.map((s) => ({ packageId: s.packageId, months: s.months })),
  startDate: f.startDate,
  reviewDate: f.reviewDate,
  heldUntil: f.heldUntil,
  instalments: f.instalments,
  paymentOffsetsMonths: [...f.paymentOffsetsMonths],
  approval: f.approval,
  pricing: { prePaise: f.prePaise, gstPaise: f.gstPaise, totalPaise: f.totalPaise },
});

/** The one sentence the buyer reads about the held offer, in the message and on the proposal. */
export const heldOfferSentence = (f: Pick<CanonicalFollowOn, "pricing" | "heldUntil">): string =>
  `The rest of the year (${formatINR(f.pricing.totalPaise)} including GST) stays open at today's rates until ${formatDate(f.heldUntil)}.`;

/** Where a held offer stands on a given day: before its review, open, or ran out unused. */
export const followOnStandingOn = (held: Pick<CanonicalFollowOn, "reviewDate" | "heldUntil">, today: CalendarDate): "waiting_review" | "due" | "lapsed" =>
  compareDates(today, held.heldUntil) > 0 ? "lapsed" : compareDates(today, held.reviewDate) < 0 ? "waiting_review" : "due";

const equalMonths = (count: number, every: number) => Array.from({ length: count }, (_, i) => i * every);

/**
 * The follow-on for a first-phase offer, or null when there is nothing left to hold, the offer is not a first phase, or the
 * remaining work would not pass the engine's own checks at today's rates (in which case nothing is promised).
 */
export function deriveFollowOn(x: EvaluatedStructure, constraints: BuyerConstraints, input: EngineInput): FollowOn | null {
  const s = x.structure;
  if (s.template !== "phased_scope" || s.scopeKind !== "phase_1" || isCounterStructureId(s.id) || s.id.includes("#")) return null;
  const { fullScope } = input.templates;
  const pkg = (id: string) => input.packages.find((p) => p.id === id);
  const phaseMonths = Math.max(...s.scope.map((item) => (pkg(item.packageId)?.kind === "monthly" ? item.months : 1)));
  const delivered = new Set(s.scope.map((item) => item.packageId));

  const scope: ScopeItem[] = [];
  for (const item of fullScope) {
    const p = pkg(item.packageId);
    if (!p) return null;
    if (p.kind === "one_time") {
      if (!delivered.has(p.id)) scope.push({ packageId: p.id, months: 1 });
    } else if (item.months > phaseMonths) {
      scope.push({ packageId: p.id, months: item.months - phaseMonths });
    }
  }
  if (!scope.length) return null;

  // The services the buyer needs and the first phase already delivers are covered; the rest are checked against what is held.
  const remaining: BuyerConstraints = { ...constraints, requiredPackages: constraints.requiredPackages.filter((id) => !delivered.has(id)) };
  const startDate = addMonths(s.startDate, phaseMonths);
  const months = Math.max(...scope.map((item) => (pkg(item.packageId)!.kind === "monthly" ? item.months : 1)));
  const tries: PaymentPlan[] = [
    { id: "follow_on_monthly", label: `${months} monthly payments`, offsetsMonths: equalMonths(months, 1) },
    ...(months >= 6 ? [{ id: "follow_on_quarterly", label: `${Math.ceil(months / 3)} quarterly payments`, offsetsMonths: equalMonths(Math.ceil(months / 3), 3) }] : []),
  ];

  for (const plan of tries) {
    const structure = buildStructure({
      template: "phased_scope",
      params: { follow_on: 1, plan: plan.id },
      label: "The rest of the year",
      scopeKind: "full",
      scope,
      fullScope,
      startDate,
      plan,
      discountBps: 0,
      packages: input.packages,
      gstRateBps: input.merchant.policy.gstRateBps,
    });
    const evaluated = evaluateStructure(structure, remaining, input);
    if (evaluated.verdict !== "feasible") continue;
    return {
      scope,
      startDate,
      reviewDate: startDate,
      heldUntil: addDays(startDate, FOLLOW_ON_POLICY.holdDays),
      instalments: structure.payments.length,
      paymentOffsetsMonths: plan.offsetsMonths,
      prePaise: structure.pricePaise,
      gstPaise: sum(structure.payments.map((p) => p.gstPaise)),
      totalPaise: sum(structure.payments.map((p) => p.totalPaise)),
      approval: evaluated.approval,
      netContributionPaise: evaluated.economics.netContributionPaise,
    };
  }
  return null;
}

/**
 * The rest of the year as a structure the engine can check and the buyer can accept, rebuilt exactly from what was held.
 * Its payment lines carry their own ids, so they never collide with the first phase's.
 */
export function followOnStructure(held: CanonicalFollowOn, input: EngineInput): Structure {
  const built = buildStructure({
    template: "phased_scope",
    params: { follow_on: 1, plan: "follow_on_rest" },
    label: "The rest of the year",
    scopeKind: "full",
    scope: held.scope,
    fullScope: input.templates.fullScope,
    startDate: held.startDate,
    plan: { id: "follow_on_rest", label: `${held.paymentOffsetsMonths.length} payments`, offsetsMonths: held.paymentOffsetsMonths },
    discountBps: 0,
    packages: input.packages,
    gstRateBps: input.merchant.policy.gstRateBps,
  });
  const pay = (id: string) => `p2-${id}`;
  return {
    ...built,
    // The first phase already delivered what this leaves out, so nothing is "not included".
    excludedPackageIds: [],
    payments: built.payments.map((p) => ({ ...p, id: pay(p.id) })),
    invoices: built.invoices.map((i) => ({ ...i, id: `p2-${i.id}`, paymentLineId: pay(i.paymentLineId) })),
  };
}

/** What the engine says about the held rest of the year now, against the buyer's constraints as they stand. */
export function evaluateFollowOn(held: CanonicalFollowOn, constraints: BuyerConstraints, input: EngineInput): EvaluatedStructure {
  const covered = new Set(held.scope.map((item) => item.packageId));
  const remaining: BuyerConstraints = { ...constraints, requiredPackages: constraints.requiredPackages.filter((id) => covered.has(id)) };
  return evaluateStructure(followOnStructure(held, input), remaining, input);
}
