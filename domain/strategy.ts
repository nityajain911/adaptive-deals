import { listValueOf, type DealBaseline } from "./deal-baseline";
import { rankFeasible, type EvaluatedStructure } from "./engine";
import { sum } from "./money";
import type { StrategyId } from "./strategy-id";

export { STRATEGY_IDS, type StrategyId } from "./strategy-id";

export const STRATEGY_LABEL: Record<StrategyId, string> = {
  protect_contribution: "Earn the most",
  preserve_scope: "Keep the full project",
  minimise_cash_exposure: "Spend the least up front",
  lower_buyer_commitment: "Smaller payments for them",
};

export type FactId =
  | "highest_contribution"
  | "lowest_cash_exposure"
  | "most_scope_retained"
  | "smallest_largest_payment"
  | "lowest_total"
  | "earliest_start"
  | "no_discount"
  | "lowest_discount"
  | "within_buyer_approval"
  | "needs_buyer_approval"
  | `tied_on:${string}`;

export interface StrategyView {
  strategy: StrategyId;
  mode: "standard" | "discount_only" | "none";
  ranked: EvaluatedStructure[];
  leader: EvaluatedStructure | null;
  withinApprovalAlternative: EvaluatedStructure | null;
  discounted: EvaluatedStructure[];
  facts: Record<string, FactId[]>;
}

const approval = (offer: EvaluatedStructure) => (offer.approval === "requires_approval" ? 1 : 0);
const largest = (offer: EvaluatedStructure) => Math.max(...offer.structure.payments.map((payment) => payment.totalPaise));
const total = (offer: EvaluatedStructure) => sum(offer.structure.payments.map((payment) => payment.totalPaise));
const scope = (offer: EvaluatedStructure, baseline: DealBaseline) => listValueOf(baseline.servicePrices, offer.structure.scope);

type Compare = (a: EvaluatedStructure, b: EvaluatedStructure) => number;

/** How many of the services the buyer said can wait an offer would start now. */
const startsWaiting = (offer: EvaluatedStructure, canWait: readonly string[]) => offer.structure.scope.filter((item) => canWait.includes(item.packageId)).length;

function strategyComparators(strategy: StrategyId, baseline: DealBaseline, canWait: readonly string[] = []): Compare[] {
  const keys: Record<string, Compare> = {
    // A service the buyer said can wait is not what they asked to start with: offers that leave it out come first under the default priority (earn the most) and under smaller payments. The owner's two explicit choices, keeping the full project and spending the least up front, are theirs and may include it.
    waiting: (a, b) => startsWaiting(a, canWait) - startsWaiting(b, canWait),
    approval: (a, b) => approval(a) - approval(b),
    contribution: (a, b) => b.economics.netContributionPaise - a.economics.netContributionPaise,
    cash: (a, b) => a.economics.peakFundingPaise - b.economics.peakFundingPaise,
    largest: (a, b) => largest(a) - largest(b),
    total: (a, b) => total(a) - total(b),
    discount: (a, b) => a.structure.discountBps - b.structure.discountBps,
    start: (a, b) => a.structure.startDate.localeCompare(b.structure.startDate),
    scope: (a, b) => scope(b, baseline) - scope(a, baseline),
    id: (a, b) => a.structure.id.localeCompare(b.structure.id),
  };
  const order: Record<StrategyId, string[]> = {
    protect_contribution: ["approval", "waiting", "contribution", "cash", "largest", "id"],
    preserve_scope: ["scope", "contribution", "cash", "largest", "id"],
    minimise_cash_exposure: ["cash", "contribution", "largest", "id"],
    lower_buyer_commitment: ["approval", "waiting", "discount", "largest", "total", "start", "id"],
  };
  return order[strategy].map((key) => keys[key]!);
}

function compareWith(comparators: Compare[]): Compare {
  return (a, b) => {
    for (const compare of comparators) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    return 0;
  };
}

export function rankByStrategy(offers: EvaluatedStructure[], strategy: StrategyId, baseline: DealBaseline, canWait: readonly string[] = []): EvaluatedStructure[] {
  // The engine's own order (recorded with every run) is kept as it is. For the merchant's default priority, offers equal on profit and cash
  // exposure are told apart by how many payments they need: every later collection is a collection risk, so fewer comes first.
  if (strategy === "protect_contribution") {
    return [...rankFeasible(offers)].sort((a, b) =>
      approval(a) - approval(b) ||
      startsWaiting(a, canWait) - startsWaiting(b, canWait) ||
      b.economics.netContributionPaise - a.economics.netContributionPaise ||
      a.economics.peakFundingPaise - b.economics.peakFundingPaise ||
      a.structure.payments.length - b.structure.payments.length ||
      largest(a) - largest(b) ||
      a.structure.id.localeCompare(b.structure.id));
  }
  return [...offers].sort(compareWith(strategyComparators(strategy, baseline, canWait)));
}

function addExtremum(args: {
  facts: FactId[];
  fact: FactId;
  tie: string;
  offerValue: number | string;
  values: (number | string)[];
  target: number | string;
}) {
  if (args.offerValue !== args.target) return;
  args.facts.push(args.fact);
  if (args.values.filter((value) => value === args.target).length > 1) args.facts.push(`tied_on:${args.tie}`);
}

export function factsFor(offer: EvaluatedStructure, among: EvaluatedStructure[], baseline: DealBaseline): FactId[] {
  if (!among.length) return [];
  const facts: FactId[] = [];
  const contributions = among.map((candidate) => candidate.economics.netContributionPaise);
  const cash = among.map((candidate) => candidate.economics.peakFundingPaise);
  const scopes = among.map((candidate) => scope(candidate, baseline));
  const largestPayments = among.map(largest);
  const totals = among.map(total);
  const starts = among.map((candidate) => candidate.structure.startDate);
  const discounts = among.map((candidate) => candidate.structure.discountBps);

  addExtremum({ facts, fact: "highest_contribution", tie: "contribution", offerValue: offer.economics.netContributionPaise, values: contributions, target: Math.max(...contributions) });
  addExtremum({ facts, fact: "lowest_cash_exposure", tie: "cash_exposure", offerValue: offer.economics.peakFundingPaise, values: cash, target: Math.min(...cash) });
  addExtremum({ facts, fact: "most_scope_retained", tie: "scope_retained", offerValue: scope(offer, baseline), values: scopes, target: Math.max(...scopes) });
  addExtremum({ facts, fact: "smallest_largest_payment", tie: "largest_payment", offerValue: largest(offer), values: largestPayments, target: Math.min(...largestPayments) });
  addExtremum({ facts, fact: "lowest_total", tie: "total", offerValue: total(offer), values: totals, target: Math.min(...totals) });
  addExtremum({ facts, fact: "earliest_start", tie: "start", offerValue: offer.structure.startDate, values: starts, target: [...starts].sort()[0]! });
  addExtremum({ facts, fact: "lowest_discount", tie: "discount", offerValue: offer.structure.discountBps, values: discounts, target: Math.min(...discounts) });
  if (offer.structure.discountBps === 0) facts.push("no_discount");
  facts.push(offer.approval === "requires_approval" ? "needs_buyer_approval" : "within_buyer_approval");
  return facts;
}

export function strategyView(feasible: EvaluatedStructure[], strategy: StrategyId, baseline: DealBaseline, canWait: readonly string[] = []): StrategyView {
  const undiscounted = feasible.filter((offer) => offer.structure.discountBps === 0);
  const discounted = feasible
    .filter((offer) => offer.structure.discountBps > 0)
    .sort(compareWith([(a, b) => a.structure.discountBps - b.structure.discountBps, ...strategyComparators(strategy, baseline, canWait)]));
  const mode: StrategyView["mode"] = undiscounted.length ? "standard" : feasible.length ? "discount_only" : "none";
  const ranked = mode === "standard" ? rankByStrategy(undiscounted, strategy, baseline, canWait) : [];
  const leader = ranked[0] ?? null;
  const comparisonSet = mode === "standard" ? ranked : discounted;
  return {
    strategy,
    mode,
    ranked,
    leader,
    withinApprovalAlternative: leader?.approval === "requires_approval"
      ? ranked.find((offer) => offer.approval === "within_limit") ?? null
      : null,
    discounted,
    facts: Object.fromEntries(comparisonSet.map((offer) => [offer.structure.id, factsFor(offer, comparisonSet, baseline)])),
  };
}

export function explainLeader(view: StrategyView, format: { inr(paise: number): string }): string {
  if (!view.leader) return view.mode === "discount_only"
    ? "No offer fits without a discount. Look at the discounts you allow, below."
    : "No offer fits.";
  const offer = view.leader;
  const facts = new Set(view.facts[offer.structure.id] ?? []);
  const approvalText = facts.has("within_buyer_approval")
    ? "The buyer can approve this on their own"
    : "Their MD has to approve this";
  let tradeoff: string;
  switch (view.strategy) {
    case "protect_contribution":
      tradeoff = `keeps about ${format.inr(offer.economics.netContributionPaise)} for you after your costs and fees${facts.has("highest_contribution") ? ", the most of these options" : ""}`;
      break;
    case "preserve_scope":
      tradeoff = `${facts.has("most_scope_retained") ? "keeps the most of what you quoted" : "keeps what you quoted"}, and you keep about ${format.inr(offer.economics.netContributionPaise)}`;
      break;
    case "minimise_cash_exposure":
      tradeoff = `needs you to spend about ${format.inr(offer.economics.peakFundingPaise)} before you are paid${facts.has("lowest_cash_exposure") ? ", the least of these options" : ""}`;
      break;
    case "lower_buyer_commitment":
      tradeoff = `has a biggest payment of ${format.inr(largest(offer))}${facts.has("smallest_largest_payment") ? ", the smallest of these options" : ""}`;
      break;
  }
  return `${approvalText}, and it ${tradeoff}.`;
}
