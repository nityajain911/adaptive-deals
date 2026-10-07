import { describe, expect, it } from "vitest";
import { validateEconomics } from "@/domain/business-economics";
import { genEconomics, rng, SEEDS } from "./gen";

describe("seeded economics generator", () => {
  it("reproduces the same complete economics content for the same seed", () => {
    expect(genEconomics(rng(73))).toEqual(genEconomics(rng(73)));
    expect(Array.from({ length: 5 }, rng(73))).toEqual(Array.from({ length: 5 }, rng(73)));
  });

  it("generates valid economics across every registered seed", () => {
    for (const seed of SEEDS) {
      const content = genEconomics(rng(seed));
      expect(validateEconomics(content).filter((issue) => issue.level === "error"), `seed ${seed}`).toEqual([]);
      expect(content.services.every((service) => service.directCostPaise >= 0 && service.directCostPaise <= Math.round(service.listPricePaise * 1.2))).toBe(true);
      expect(content.guardrails.contributionFloor.minPercentBps).toBeGreaterThanOrEqual(0);
      expect(content.guardrails.contributionFloor.minPercentBps).toBeLessThanOrEqual(6000);
      expect(content.guardrails.cashAtRiskLimitPaise).toBeGreaterThanOrEqual(0);
      expect(content.guardrails.cashAtRiskLimitPaise).toBeLessThanOrEqual(5_000_000);
      expect(content.discountLadderBps).toContain(0);
      expect(content.discountLadderBps.every((level) => level <= content.guardrails.discountLimitBps)).toBe(true);
    }
  });
});
