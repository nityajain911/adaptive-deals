import { describe, expect, it } from "vitest";
import { interpretations } from "@/domain/constraints";
import { enumerateAndEvaluate } from "@/domain/engine";
import { sum } from "@/domain/money";
import {
  explainLeader,
  factsFor,
  strategyView,
  type FactId,
  type StrategyId,
} from "@/domain/strategy";
import { clarifiedHeroProfile, heroBaseline, heroInput } from "../helpers";

const constraints = () => interpretations(clarifiedHeroProfile())[0]!.constraints;
const feasible = () => enumerateAndEvaluate(constraints(), heroInput()).feasible;
const top = (strategy: StrategyId) => strategyView(feasible(), strategy, heroBaseline()).leader!.structure.id;
const largest = (offer: ReturnType<typeof feasible>[number]) => Math.max(...offer.structure.payments.map((payment) => payment.totalPaise));
const total = (offer: ReturnType<typeof feasible>[number]) => sum(offer.structure.payments.map((payment) => payment.totalPaise));

describe("deterministic recommendation strategies", () => {
  it("recommends the two-payment phase for Protect contribution and Lower buyer commitment", () => {
    expect(top("protect_contribution")).toBe("phased_scope:scope=web-search-report-3m,plan=two_monthly");
    expect(top("lower_buyer_commitment")).toBe("phased_scope:scope=web-search-report-3m,plan=two_monthly");
  });

  it("lets Preserve scope and Minimise cash exposure lead with annual scope while naming the best within-approval alternative", () => {
    for (const strategy of ["preserve_scope", "minimise_cash_exposure"] as const) {
      const view = strategyView(feasible(), strategy, heroBaseline());
      expect(view.leader?.structure.id).toBe("split_payment:plan=deposit_30");
      expect(view.leader?.approval).toBe("requires_approval");
      expect(view.withinApprovalAlternative?.structure.id).toBe("phased_scope:scope=web-search-report-3m,plan=two_monthly");
    }
  });

  it("does not invent an approval alternative when the leader already fits the buyer's limit", () => {
    expect(strategyView(feasible(), "protect_contribution", heroBaseline()).withinApprovalAlternative).toBeNull();
  });

  it("attaches only comparative facts that are numerically true for the offer", () => {
    const offers = feasible();
    for (const offer of offers) {
      const facts = factsFor(offer, offers, heroBaseline());
      const scope = offer.structure.scope.reduce((value, item) => {
        const price = heroBaseline().servicePrices.find((candidate) => candidate.packageId === item.packageId)!;
        return value + price.listPricePaise * (price.kind === "monthly" ? item.months : 1);
      }, 0);
      const assertions: Partial<Record<FactId, boolean>> = {
        highest_contribution: offer.economics.netContributionPaise === Math.max(...offers.map((candidate) => candidate.economics.netContributionPaise)),
        lowest_cash_exposure: offer.economics.peakFundingPaise === Math.min(...offers.map((candidate) => candidate.economics.peakFundingPaise)),
        most_scope_retained: scope === Math.max(...offers.map((candidate) => candidate.structure.listPricePaise)),
        smallest_largest_payment: largest(offer) === Math.min(...offers.map(largest)),
        lowest_total: total(offer) === Math.min(...offers.map(total)),
        earliest_start: offer.structure.startDate === [...offers].map((candidate) => candidate.structure.startDate).sort()[0],
        no_discount: offer.structure.discountBps === 0,
        lowest_discount: offer.structure.discountBps === Math.min(...offers.map((candidate) => candidate.structure.discountBps)),
        within_buyer_approval: offer.approval === "within_limit",
        needs_buyer_approval: offer.approval === "requires_approval",
      };
      for (const fact of facts.filter((item) => !item.startsWith("tied_on:"))) {
        expect(assertions[fact], `${offer.structure.id}: ${fact}`).toBe(true);
      }
    }
  });

  it("writes every ordinal claim from the leader's closed fact set", () => {
    const view = strategyView(feasible(), "protect_contribution", heroBaseline());
    const text = explainLeader(view, { inr: (paise) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}` });
    expect(text).toContain("keeps about ₹19,330 for you after your costs and fees");
    expect(text).toContain("₹19,330");
    expect(text).toContain("The buyer can approve this on their own");
    expect(text.includes("highest")).toBe(view.facts[view.leader!.structure.id].includes("highest_contribution"));

    const withoutHighest = {
      ...view,
      facts: { ...view.facts, [view.leader!.structure.id]: view.facts[view.leader!.structure.id].filter((fact) => fact !== "highest_contribution") },
    };
    expect(explainLeader(withoutHighest, { inr: () => "₹19,330" })).not.toContain("highest");
  });

  it("keeps discounts out of the proactive recommendation and orders the separate list by the smallest discount", () => {
    const input = heroInput();
    input.merchant.policy.discountLimitBps = 1000;
    input.templates.discountsBps = [0, 500, 1000];
    const all = enumerateAndEvaluate(constraints(), input).feasible;
    for (const strategy of ["protect_contribution", "preserve_scope", "minimise_cash_exposure", "lower_buyer_commitment"] as const) {
      const view = strategyView(all, strategy, heroBaseline());
      expect(view.mode).toBe("standard");
      expect(view.ranked.every((offer) => offer.structure.discountBps === 0)).toBe(true);
      expect(view.discounted.map((offer) => offer.structure.discountBps)).toEqual([...view.discounted].map((offer) => offer.structure.discountBps).sort((a, b) => a - b));
    }

    const tighterBuyer = structuredClone(constraints());
    tighterBuyer.budgetNow!.amountPaise = 4_000_000;
    tighterBuyer.latestStart = { value: "2026-12-31", precision: "day" };
    const discountOnly = enumerateAndEvaluate(tighterBuyer, input).feasible;
    expect(discountOnly.some((offer) => offer.structure.discountBps > 0)).toBe(true);
    expect(discountOnly.some((offer) => offer.structure.discountBps === 0)).toBe(false);
    expect(strategyView(discountOnly, "protect_contribution", heroBaseline())).toMatchObject({ mode: "discount_only", ranked: [], leader: null });
  });
});
