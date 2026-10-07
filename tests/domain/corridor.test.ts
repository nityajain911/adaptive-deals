import { describe, expect, it } from "vitest";
import { activate } from "@/domain/business-economics";
import { interpretations } from "@/domain/constraints";
import { counterStructure, failingCounterChecks } from "@/domain/counter";
import { CORRIDOR_EVALUATION_LIMIT, lowestCompliantTotal } from "@/domain/corridor";
import { enumerateAndEvaluate, evaluateStructure, type EngineInput } from "@/domain/engine";
import { sum } from "@/domain/money";
import { engineInputFor } from "@/lib/deal-economics";
import { heroMerchant } from "@/data/synthetic/hero";
import { clarifiedHeroProfile, heroBaseline, heroInput } from "../helpers";
import { genEconomics, rng, SEEDS } from "../helpers/gen";

const constraints = interpretations(clarifiedHeroProfile())[0].constraints;
const TWO_PAYMENTS = (engine: EngineInput) => enumerateAndEvaluate(constraints, engine).feasible.find((x) => x.structure.template === "phased_scope" && x.structure.payments.length === 2 && x.structure.discountBps === 0);
const totalOf = (s: { payments: { totalPaise: number }[] }) => sum(s.payments.map((p) => p.totalPaise));
const run = (engine: EngineInput, limit?: number) => {
  const base = TWO_PAYMENTS(engine)!.structure;
  return { base, result: lowestCompliantTotal({ base, constraints, engine, limit }) };
};
const passes = (engine: EngineInput, base: ReturnType<typeof run>["base"], total: number) =>
  failingCounterChecks(evaluateStructure(counterStructure(base, total, engine.merchant.policy.gstRateBps), constraints, engine)).length === 0;

describe("the lowest total that meets every rule", () => {
  it("is the current offer when the merchant permits no discount: nothing lower passes", () => {
    const { result } = run(heroInput());
    expect(result).toMatchObject({ currentTotalPaise: 4_602_000, currentPasses: true, lowestCompliantPaise: 4_602_000, unavailableReason: null });
  });

  it("with a 10% maximum discount is about 90% of the current offer, and it passes while one rupee less fails", () => {
    const engine = heroInput();
    engine.merchant.policy.discountLimitBps = 1000;
    const { base, result } = run(engine);
    expect(Math.abs(result.lowestCompliantPaise! - 4_141_800)).toBeLessThanOrEqual(100);
    expect(passes(engine, base, result.lowestCompliantPaise!)).toBe(true);
    expect(passes(engine, base, result.lowestCompliantPaise! - 100)).toBe(false);
  });

  it("is set by the contribution floor when that binds before the discount ceiling, and says which rule fails just below it", () => {
    const engine = heroInput();
    engine.merchant.policy.discountLimitBps = 10_000;
    engine.merchant.policy.cashAtRiskLimitPaise = 10_000_000;
    engine.merchant.policy.smallestInstalmentPaise = 100;
    const { base, result } = run(engine);
    const lowest = result.lowestCompliantPaise!;
    expect(lowest).toBeLessThan(4_602_000);
    expect(passes(engine, base, lowest)).toBe(true);
    const below = failingCounterChecks(evaluateStructure(counterStructure(base, lowest - 100, engine.merchant.policy.gstRateBps), constraints, engine));
    expect(below.map((c) => c.id)).toContain("seller_contribution");
  });

  it("finds nothing when the current offer itself does not meet every rule, and says so", () => {
    const engine = heroInput();
    const base = TWO_PAYMENTS(engine)!.structure;
    const strict = heroInput();
    strict.merchant.policy.cashAtRiskLimitPaise = 0;
    strict.merchant.policy.smallestInstalmentPaise = 10_000_000;
    expect(lowestCompliantTotal({ base, constraints, engine: strict })).toMatchObject({ currentPasses: false, lowestCompliantPaise: null, unavailableReason: null });
  });

  it("stops at its evaluation limit, reports it, and never throws or offers a number it did not verify", () => {
    const engine = heroInput();
    engine.merchant.policy.discountLimitBps = 10_000;
    engine.merchant.policy.cashAtRiskLimitPaise = 10_000_000;
    engine.merchant.policy.smallestInstalmentPaise = 100;
    const { result } = run(engine, 5);
    expect(result).toMatchObject({ lowestCompliantPaise: null, unavailableReason: "evaluation_limit" });
    expect(result.evaluations).toBeLessThanOrEqual(5);
    expect(CORRIDOR_EVALUATION_LIMIT).toBe(6000);
  });

  it("holds for generated economics: whatever it returns passes, and one rupee lower fails", () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const version = activate(genEconomics(rng(seed)), { version: 2, activatedAt: "2026-10-06T10:00:00+05:30", activatedBy: "m" });
      const engine = engineInputFor({ merchant: heroMerchant, baseline: heroBaseline(), version, overrides: [] });
      const offer = TWO_PAYMENTS(engine);
      if (!offer) continue;
      const result = lowestCompliantTotal({ base: offer.structure, constraints, engine });
      expect(result.currentTotalPaise, `seed ${seed}`).toBe(totalOf(offer.structure));
      if (result.lowestCompliantPaise === null) continue;
      checked++;
      // The current offer is evaluated as it stands; a lower total is evaluated as a counter-offer.
      const ok = result.lowestCompliantPaise === result.currentTotalPaise ? failingCounterChecks(evaluateStructure(offer.structure, constraints, engine)).length === 0 : passes(engine, offer.structure, result.lowestCompliantPaise);
      expect(ok, `seed ${seed}: it passes`).toBe(true);
      if (result.lowestCompliantPaise > 100) expect(passes(engine, offer.structure, result.lowestCompliantPaise - 100), `seed ${seed}: one rupee lower fails`).toBe(false);
    }
    expect(checked).toBeGreaterThan(20);
  });
});
