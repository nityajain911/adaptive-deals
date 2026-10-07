import { describe, expect, it } from "vitest";
import { toRawExtraction } from "@/ai/extract";
import { activate } from "@/domain/business-economics";
import { applyClarificationAnswer, buildConstraintProfile, interpretations } from "@/domain/constraints";
import { enumerateAndEvaluate, rankFeasible, type EngineInput } from "@/domain/engine";
import { rankByStrategy, strategyView, STRATEGY_IDS } from "@/domain/strategy";
import type { BuyerConstraints } from "@/domain/types";
import { allDemoCases } from "@/data/synthetic/cases";
import { heroClarificationAnswers } from "@/data/synthetic/hero";
import { engineInputFor } from "@/lib/deal-economics";
import { genEconomics, rng, SEEDS } from "../helpers/gen";
import { heroBaseline } from "../helpers";

const cases = allDemoCases().map((item) => {
  let profile = buildConstraintProfile({
    dealId: item.deal.dealId,
    extraction: toRawExtraction(item.expected.extraction),
    messages: item.deal.messages,
    packages: item.deal.packages,
    timeZone: item.deal.merchant.timeZone,
  });
  for (const answer of item.expected.recordedAnswers) {
    if (answer.questionId === "clar-gst") {
      profile = applyClarificationAnswer(profile, "amountsIncludeGst", heroClarificationAnswers.gst.value, heroClarificationAnswers.gst);
    } else {
      profile = applyClarificationAnswer(profile, "approvalScope", heroClarificationAnswers.approvalScope.value, heroClarificationAnswers.approvalScope);
    }
  }
  return { id: item.id, merchant: item.deal.merchant, constraints: interpretations(profile)[0]!.constraints };
});

const ids = (offers: ReturnType<typeof rankFeasible>) => offers.map((offer) => offer.structure.id);
const subset = (left: Set<string>, right: Set<string>) => [...left].every((id) => right.has(id));
const feasibleIds = (constraints: BuyerConstraints, input: EngineInput) => new Set(enumerateAndEvaluate(constraints, input).feasible.map((offer) => offer.structure.id));

describe("strategy properties over generated merchant economics", () => {
  it("returns a stable permutation, keeps Protect contribution identical to the engine ranker, and excludes proactive discounts", () => {
    for (const seed of SEEDS) {
      const version = activate(genEconomics(rng(seed)), { version: seed, activatedAt: "2026-10-07T10:00:00+05:30", activatedBy: "property test" });
      for (const scenario of cases) {
        const input = engineInputFor({ merchant: scenario.merchant, baseline: heroBaseline(), version, overrides: [] });
        const feasible = enumerateAndEvaluate(scenario.constraints, input).feasible;
        for (const strategy of STRATEGY_IDS) {
          const first = rankByStrategy(feasible, strategy, heroBaseline());
          const second = rankByStrategy(feasible, strategy, heroBaseline());
          const reversed = rankByStrategy([...feasible].reverse(), strategy, heroBaseline());
          expect([...ids(first)].sort(), `seed ${seed}, ${scenario.id}, ${strategy}`).toEqual([...ids(feasible)].sort());
          expect(ids(second)).toEqual(ids(first));
          expect(ids(reversed)).toEqual(ids(first));
          if (strategy === "protect_contribution") expect(first).toEqual(rankFeasible(feasible));

          const view = strategyView(feasible, strategy, heroBaseline());
          if (feasible.some((offer) => offer.structure.discountBps === 0)) {
            expect(view.ranked.every((offer) => offer.structure.discountBps === 0), `seed ${seed}, ${scenario.id}, ${strategy}`).toBe(true);
          }
        }
      }
    }
  });

  it("never removes a feasible offer when one merchant guardrail is loosened", () => {
    for (const seed of SEEDS) {
      const version = activate(genEconomics(rng(seed)), { version: seed, activatedAt: "2026-10-07T10:00:00+05:30", activatedBy: "property test" });
      for (const scenario of cases) {
        const base = engineInputFor({ merchant: scenario.merchant, baseline: heroBaseline(), version, overrides: [] });
        const looser: { name: string; input: EngineInput }[] = [
          { name: "contribution floor", input: structuredClone(base) },
          { name: "cash exposure", input: structuredClone(base) },
          { name: "discount ceiling", input: structuredClone(base) },
          { name: "minimum payment", input: structuredClone(base) },
          { name: "maximum duration", input: structuredClone(base) },
        ];
        looser[0]!.input.merchant.policy.contributionFloor = { minPercentBps: 0, minPaise: null, combine: "both" };
        looser[1]!.input.merchant.policy.cashAtRiskLimitPaise = 10_000_000;
        looser[2]!.input.merchant.policy.discountLimitBps = 10_000;
        looser[3]!.input.merchant.policy.smallestInstalmentPaise = 1;
        looser[4]!.input.merchant.policy.maxTenureMonths = 120;

        const baseIds = feasibleIds(scenario.constraints, base);
        for (const item of looser) {
          const looseIds = feasibleIds(scenario.constraints, item.input);
          // Loosening means base ⊆ loose; read in reverse, tightening the loose input back to base
          // means the tightened feasible set is a subset of the one it came from.
          expect(subset(baseIds, looseIds), `seed ${seed}, ${scenario.id}, loosen/tighten ${item.name}`).toBe(true);
        }
      }
    }
  }, 15_000);

  it("always gives the engine the deal's baseline services and prices", () => {
    const expected = heroBaseline().servicePrices.map(({ packageId, listPricePaise }) => ({ packageId, listPricePaise }));
    for (const seed of SEEDS) {
      const version = activate(genEconomics(rng(seed)), { version: seed, activatedAt: "2026-10-07T10:00:00+05:30", activatedBy: "property test" });
      const input = engineInputFor({ merchant: cases[0]!.merchant, baseline: heroBaseline(), version, overrides: [] });
      expect(input.packages.map(({ id: packageId, listPricePaise }) => ({ packageId, listPricePaise })), `seed ${seed}`).toEqual(expected);
    }
  });
});
