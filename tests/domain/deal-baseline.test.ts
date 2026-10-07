import { describe, expect, it } from "vitest";
import { heroMerchant, heroPackages, heroTemplates } from "@/data/synthetic/hero";
import { BaselineError, captureBaseline, listValueOf } from "@/domain/deal-baseline";

const args = () => ({
  services: heroPackages,
  quotedScope: heroTemplates.fullScope,
  quotedPrePaise: 12_000_000,
  gstRateBps: heroMerchant.policy.gstRateBps,
  economicsVersion: 1,
});

describe("the deal baseline", () => {
  it("snapshots every service price and the quote: ₹1,20,000 + 18% GST = ₹1,41,600", () => {
    const baseline = captureBaseline(args());
    expect(baseline.servicePrices).toEqual(heroPackages.map((service) => ({ packageId: service.id, kind: service.kind, listPricePaise: service.listPricePaise })));
    expect([baseline.quotedPrePaise, baseline.quotedGstPaise, baseline.quotedTotalPaise]).toEqual([12_000_000, 2_160_000, 14_160_000]);
    expect(baseline.economicsVersionAtStart).toBe(1);
  });

  it("refuses a quote that does not equal its own price snapshot", () => {
    expect(() => captureBaseline({ ...args(), quotedPrePaise: 12_000_001 })).toThrow(BaselineError);
  });

  it("values a scope from the snapshot, and refuses a service that is not in it", () => {
    const baseline = captureBaseline(args());
    const phase = heroTemplates.phased_scope.phase1Scopes[0].items;
    expect(listValueOf(baseline.servicePrices, phase)).toBe(3_900_000);
    expect(() => listValueOf(baseline.servicePrices, [{ packageId: "nope", months: 1 }])).toThrow(BaselineError);
  });

  it("is unaffected by later edits to the services it was captured from", () => {
    const services = structuredClone(heroPackages);
    const baseline = captureBaseline({ ...args(), services });
    services[0].listPricePaise += 500_000;
    expect(baseline.servicePrices[0].listPricePaise).toBe(heroPackages[0].listPricePaise);
  });
});
