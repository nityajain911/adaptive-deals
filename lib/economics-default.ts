import { heroMerchant, heroPackages, heroTemplates } from "@/data/synthetic/hero";
import { activate, type BusinessEconomics, type EconomicsContent } from "@/domain/business-economics";
import { DEMO_ANCHOR } from "@/domain/clock";

/** Version 1: the fixture values, copied so nothing can edit the fixtures through it. */
export function defaultEconomicsContent(): EconomicsContent {
  const policy = heroMerchant.policy;
  const { discountsBps, ...offerTypes } = heroTemplates;
  return structuredClone({
    services: heroPackages,
    guardrails: {
      contributionFloor: policy.contributionFloor,
      discountLimitBps: policy.discountLimitBps,
      cashAtRiskLimitPaise: policy.cashAtRiskLimitPaise,
      smallestInstalmentPaise: policy.smallestInstalmentPaise,
      maxTenureMonths: policy.maxTenureMonths,
      paymentFeeBps: policy.paymentFeeBps,
    },
    discountLadderBps: discountsBps,
    fixed: {
      gstRateBps: policy.gstRateBps,
      advanceNoticeDays: policy.advanceNoticeDays,
      internalRetryAfterDays: policy.internalRetryAfterDays,
      mandateEndBufferMonths: policy.mandateEndBufferMonths,
      offerTypes,
    },
  });
}

export const defaultEconomics = (): BusinessEconomics =>
  activate(defaultEconomicsContent(), {
    version: 1,
    activatedAt: DEMO_ANCHOR,
    activatedBy: "Default demo economics",
  });
