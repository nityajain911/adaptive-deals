import { describe, expect, it } from "vitest";
import { heroMerchant, heroPackages, heroTemplates } from "@/data/synthetic/hero";
import { validateEconomics } from "@/domain/business-economics";
import { defaultEconomics, defaultEconomicsContent } from "@/lib/economics-default";

describe("the default demo economics", () => {
  it("is version 1, valid, and carries the fixture values unchanged", () => {
    const economics = defaultEconomics();
    expect(economics.version).toBe(1);
    expect(validateEconomics(defaultEconomicsContent()).filter((issue) => issue.level === "error")).toEqual([]);
    expect(economics.services).toEqual(heroPackages);
    expect(economics.discountLadderBps).toEqual(heroTemplates.discountsBps);
    expect(economics.guardrails.discountLimitBps).toBe(heroMerchant.policy.discountLimitBps);
    expect({ ...economics.fixed.offerTypes, discountsBps: economics.discountLadderBps }).toEqual(heroTemplates);
  });

  it("does not share objects with the fixtures", () => {
    const economics = defaultEconomics();
    economics.services[0].directCostPaise += 1;
    expect(heroPackages[0].directCostPaise).not.toBe(economics.services[0].directCostPaise);
  });
});
