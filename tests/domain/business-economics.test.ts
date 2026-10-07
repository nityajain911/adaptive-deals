import { describe, expect, it } from "vitest";
import { activate, economicsContentHash, economicsContentOf, EconomicsError, validateEconomics, type EconomicsContent } from "@/domain/business-economics";
import { heroMerchant, heroPackages, heroTemplates } from "@/data/synthetic/hero";

const { discountsBps, ...offerTypes } = heroTemplates;
const content = (): EconomicsContent =>
  structuredClone({
    services: heroPackages,
    guardrails: {
      contributionFloor: heroMerchant.policy.contributionFloor,
      discountLimitBps: heroMerchant.policy.discountLimitBps,
      cashAtRiskLimitPaise: heroMerchant.policy.cashAtRiskLimitPaise,
      smallestInstalmentPaise: heroMerchant.policy.smallestInstalmentPaise,
      maxTenureMonths: heroMerchant.policy.maxTenureMonths,
      paymentFeeBps: heroMerchant.policy.paymentFeeBps,
    },
    discountLadderBps: discountsBps,
    fixed: {
      gstRateBps: heroMerchant.policy.gstRateBps,
      advanceNoticeDays: heroMerchant.policy.advanceNoticeDays,
      internalRetryAfterDays: heroMerchant.policy.internalRetryAfterDays,
      mandateEndBufferMonths: heroMerchant.policy.mandateEndBufferMonths,
      offerTypes,
    },
  });
const errors = (c: EconomicsContent) => validateEconomics(c).filter((i) => i.level === "error").map((i) => i.field);

describe("the content hash", () => {
  it("is stable under key order and service order, and changes with any engine-relevant value", () => {
    const a = content();
    const reordered = { fixed: a.fixed, discountLadderBps: a.discountLadderBps, guardrails: a.guardrails, services: [...a.services].reverse() };
    expect(economicsContentHash(reordered)).toBe(economicsContentHash(a));
    const cost = content();
    cost.services[0].directCostPaise += 100;
    expect(economicsContentHash(cost)).not.toBe(economicsContentHash(a));
    const ladder = content();
    ladder.guardrails.discountLimitBps = 1000;
    ladder.discountLadderBps = [0, 500, 1000];
    expect(economicsContentHash(ladder)).not.toBe(economicsContentHash(a));
  });
});

describe("validation", () => {
  it("accepts the default demo economics with no error", () => {
    expect(errors(content())).toEqual([]);
  });
  it.each([
    ["a ladder level above the ceiling", (c: EconomicsContent) => { c.discountLadderBps = [0, 500]; }, "discountLadderBps"],
    ["a ladder without 0%", (c: EconomicsContent) => { c.guardrails.discountLimitBps = 500; c.discountLadderBps = [500]; }, "discountLadderBps"],
    ["a negative cost", (c: EconomicsContent) => { c.services[0].directCostPaise = -1; }, "services.website-fixes.directCostPaise"],
    ["a zero price", (c: EconomicsContent) => { c.services[0].listPricePaise = 0; }, "services.website-fixes.listPricePaise"],
    ["a discount ceiling above 100%", (c: EconomicsContent) => { c.guardrails.discountLimitBps = 10_001; }, "guardrails.discountLimitBps"],
    ["a zero minimum payment", (c: EconomicsContent) => { c.guardrails.smallestInstalmentPaise = 0; }, "guardrails.smallestInstalmentPaise"],
    ["a zero duration", (c: EconomicsContent) => { c.guardrails.maxTenureMonths = 0; }, "guardrails.maxTenureMonths"],
    ["a duplicate service id", (c: EconomicsContent) => { c.services[1].id = c.services[0].id; }, "services"],
    ["a dependency on an unknown service", (c: EconomicsContent) => { c.services[0].dependsOnAny = ["nope"]; }, "services.website-fixes.dependsOnAny"],
  ] as const)("rejects %s", (_n, mutate, field) => {
    const c = content();
    mutate(c);
    expect(errors(c)).toContain(field);
  });
  it("warns, without blocking, when a service costs more than its price", () => {
    const c = content();
    c.services[0].directCostPaise = c.services[0].listPricePaise + 1;
    const issues = validateEconomics(c);
    expect(issues.some((i) => i.level === "warning" && i.field === "services.website-fixes.directCostPaise")).toBe(true);
    expect(issues.some((i) => i.level === "error")).toBe(false);
  });
});

describe("activation", () => {
  it("stamps a version and the content hash", () => {
    const e = activate(content(), { version: 1, activatedAt: "2026-10-01T09:00:00+05:30", activatedBy: "Merchant (Pinecone Media Works)" });
    expect(e).toMatchObject({ version: 1, hash: economicsContentHash(content()) });
  });
  it("refuses content with an error", () => {
    const c = content();
    c.discountLadderBps = [0, 500];
    expect(() => activate(c, { version: 2, activatedAt: "x", activatedBy: "m" })).toThrow(EconomicsError);
  });
});

describe("the editable content of an activated version", () => {
  it("keeps only the editable content, so an editor never sends a version, hash or timestamp as a draft", () => {
    const e = activate(content(), { version: 3, activatedAt: "2026-10-01T09:00:00+05:30", activatedBy: "m" });
    const c = economicsContentOf(e);
    expect(Object.keys(c).sort()).toEqual(["discountLadderBps", "fixed", "guardrails", "services"]);
    expect(economicsContentHash(c)).toBe(e.hash);
  });
  it("is a copy: editing it never changes the version it came from", () => {
    const e = activate(content(), { version: 1, activatedAt: "x", activatedBy: "m" });
    const c = economicsContentOf(e);
    c.services[0].directCostPaise += 1;
    c.discountLadderBps.push(500);
    expect(e.services[0].directCostPaise).not.toBe(c.services[0].directCostPaise);
    expect(e.discountLadderBps).not.toContain(500);
  });
});
