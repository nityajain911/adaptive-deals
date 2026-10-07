import { describe, expect, it } from "vitest";
import { heroMerchant, heroPackages, heroTemplates } from "@/data/synthetic/hero";
import { activate } from "@/domain/business-economics";
import { captureBaseline } from "@/domain/deal-baseline";
import { defaultEconomics, defaultEconomicsContent } from "@/lib/economics-default";
import { EconomicsConflictError, effectiveHashOf, engineInputFor, overrideDirection, pinConflicts, type InputOverride } from "@/lib/deal-economics";

const baseline = () => captureBaseline({
  services: heroPackages,
  quotedScope: heroTemplates.fullScope,
  quotedPrePaise: 12_000_000,
  gstRateBps: 1800,
  economicsVersion: 1,
});
const version = (mutate: (content: ReturnType<typeof defaultEconomicsContent>) => void, number = 2) => {
  const content = defaultEconomicsContent();
  mutate(content);
  return activate(content, { version: number, activatedAt: "2026-10-06T10:00:00+05:30", activatedBy: "m" });
};
const inputs = (economics = defaultEconomics(), overrides: InputOverride[] = []) =>
  engineInputFor({ merchant: heroMerchant, baseline: baseline(), version: economics, overrides });

describe("engine inputs for a deal", () => {
  it("under version 1 are exactly the fixtures the recordings were made with", () => {
    const input = inputs();
    expect(input.packages).toEqual(heroPackages);
    expect(input.templates).toEqual(heroTemplates);
    expect(input.merchant.policy).toEqual(heroMerchant.policy);
    expect(effectiveHashOf(input)).toBe(effectiveHashOf({ merchant: heroMerchant, packages: heroPackages, templates: heroTemplates }));
  });

  it("never takes a price from a newer version: only costs, guardrails and the ladder move", () => {
    const next = version((content) => {
      content.services[0].listPricePaise += 900_000;
      content.services[0].directCostPaise += 100_000;
      content.guardrails.discountLimitBps = 1000;
      content.discountLadderBps = [0, 500, 1000];
    });
    const input = inputs(next);
    expect(input.packages.map((service) => service.listPricePaise)).toEqual(heroPackages.map((service) => service.listPricePaise));
    expect(input.packages[0].directCostPaise).toBe(heroPackages[0].directCostPaise + 100_000);
    expect(input.templates.discountsBps).toEqual([0, 500, 1000]);
    expect(input.merchant.policy.discountLimitBps).toBe(1000);
  });

  it("has the same hash when a version changes standard prices only", () => {
    const priceOnly = version((content) => { for (const service of content.services) service.listPricePaise += 100_000; });
    expect(effectiveHashOf(inputs(priceOnly))).toBe(effectiveHashOf(inputs()));
    const cost = version((content) => { content.services[0].directCostPaise += 1; });
    expect(effectiveHashOf(inputs(cost))).not.toBe(effectiveHashOf(inputs()));
  });

  it("applies input overrides on top of the pinned version", () => {
    const overrides: InputOverride[] = [{
      id: "ovr-1",
      field: "direct_cost",
      packageId: heroPackages[0].id,
      value: 1_500_000,
      accountValue: heroPackages[0].directCostPaise,
      direction: "tightens",
      reason: "Extra migration work",
      by: "m",
      at: "x",
    }];
    expect(inputs(defaultEconomics(), overrides).packages[0].directCostPaise).toBe(1_500_000);
  });

  it("keeps exactly the baseline's services, and refuses a version that leaves that set", () => {
    const added = version((content) => { content.services.push({ ...content.services[0], id: "analytics", name: "Analytics setup" }); });
    expect(inputs(added).packages.map((service) => service.id)).toEqual(heroPackages.map((service) => service.id));

    const dependsOutside = version((content) => {
      content.services.push({ ...content.services[0], id: "analytics", name: "Analytics setup" });
      content.services[1].dependsOnAny = ["analytics"];
    });
    expect(pinConflicts(baseline(), dependsOutside).join(" ")).toMatch(/Analytics setup, which was not part of this deal/);
    expect(() => inputs(dependsOutside)).toThrow(EconomicsConflictError);

    const removed = version((content) => {
      content.services = content.services.slice(1);
      content.fixed.offerTypes.fullScope = content.fixed.offerTypes.fullScope.filter((item) => item.packageId !== heroPackages[0].id);
      for (const phase of content.fixed.offerTypes.phased_scope.phase1Scopes) {
        phase.items = phase.items.filter((item) => item.packageId !== heroPackages[0].id);
      }
    });
    expect(pinConflicts(baseline(), removed).join(" ")).toMatch(/is no longer one of your services/);
  });
});

describe("the direction of an override", () => {
  it.each([
    ["direct_cost", 100, 200, "tightens"],
    ["direct_cost", 200, 100, "loosens"],
    ["cash_exposure", 1000, 500, "tightens"],
    ["cash_exposure", 500, 1000, "loosens"],
    ["discount_limit", 0, 500, "loosens"],
    ["discount_limit", 500, 500, "neutral"],
  ] as const)("%s from %i to %i %s the account rule", (field, account, value, expected) => {
    expect(overrideDirection(field, account, value)).toBe(expected);
  });
});
