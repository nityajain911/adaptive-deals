import { createHash } from "node:crypto";
import { canonicalJson } from "@/domain/agreement";
import type { BusinessEconomics } from "@/domain/business-economics";
import type { DealBaseline } from "@/domain/deal-baseline";
import type { EngineInput } from "@/domain/engine";
import type { StrategyId } from "@/domain/strategy-id";
import type { ContributionFloor, Merchant, ScopeItem, TemplateConfig } from "@/domain/types";

export type OverrideField = "direct_cost" | "contribution_floor" | "cash_exposure" | "discount_limit";

export interface InputOverride {
  id: string;
  field: OverrideField;
  packageId?: string;
  value: number | ContributionFloor;
  accountValue: number | ContributionFloor;
  direction: "tightens" | "loosens" | "neutral";
  reason: string;
  by: string;
  at: string;
}

export interface DealEconomics {
  pinned: { version: number; hash: string };
  overrides: InputOverride[];
  strategy: StrategyId;
  effectiveHash: string;
}

export class EconomicsConflictError extends Error {}

function scopePackageIds(version: BusinessEconomics): string[] {
  const offerTypes = version.fixed.offerTypes;
  const scopes: ScopeItem[][] = [offerTypes.fullScope, ...offerTypes.phased_scope.phase1Scopes.map((phase) => phase.items)];
  return scopes.flat().map((item) => item.packageId);
}

export function pinConflicts(baseline: DealBaseline, version: BusinessEconomics): string[] {
  const conflicts: string[] = [];
  const baselineIds = new Set(baseline.servicePrices.map((price) => price.packageId));
  const services = new Map(version.services.map((service) => [service.id, service]));

  for (const price of baseline.servicePrices) {
    const service = services.get(price.packageId);
    if (!service) {
      conflicts.push(`${price.packageId} is no longer one of your services.`);
      continue;
    }
    for (const dependency of service.dependsOnAny ?? []) {
      if (baselineIds.has(dependency)) continue;
      const name = services.get(dependency)?.name ?? dependency;
      conflicts.push(`${service.name} now depends on ${name}, which was not part of this deal.`);
    }
  }

  for (const packageId of scopePackageIds(version)) {
    if (!baselineIds.has(packageId)) {
      const name = services.get(packageId)?.name ?? packageId;
      conflicts.push(`The approved offer types include ${name}, which was not part of this deal.`);
    }
  }
  return [...new Set(conflicts)];
}

const numberOverride = (overrides: InputOverride[], field: OverrideField, fallback: number, packageId?: string): number => {
  const match = [...overrides].reverse().find((override) => override.field === field && override.packageId === packageId);
  return typeof match?.value === "number" ? match.value : fallback;
};

/**
 * Terms the merchant agreed for one buyer, on top of the account's own: how far they will discount and the ways to pay they offer this
 * buyer. The account is unchanged, and no other deal sees them. A case that has none is worked out from the account alone.
 */
export interface DealTerms {
  discountLimitBps: number;
  templates: Omit<TemplateConfig, "fullScope">;
}

export function engineInputFor(args: {
  merchant: Merchant;
  baseline: DealBaseline;
  version: BusinessEconomics;
  overrides: InputOverride[];
  terms?: DealTerms | null;
}): EngineInput {
  const conflicts = pinConflicts(args.baseline, args.version);
  if (conflicts.length) throw new EconomicsConflictError(conflicts.join(" "));

  const versionServices = new Map(args.version.services.map((service) => [service.id, service]));
  const packages = args.baseline.servicePrices.map((price) => {
    const service = versionServices.get(price.packageId)!;
    return {
      ...structuredClone(service),
      kind: price.kind,
      listPricePaise: price.listPricePaise,
      directCostPaise: numberOverride(args.overrides, "direct_cost", service.directCostPaise, service.id),
    };
  });

  const contributionOverride = [...args.overrides].reverse().find((override) => override.field === "contribution_floor");
  const contributionFloor = contributionOverride && typeof contributionOverride.value !== "number"
    ? structuredClone(contributionOverride.value)
    : structuredClone(args.version.guardrails.contributionFloor);
  const discountLimitBps = numberOverride(args.overrides, "discount_limit", args.terms?.discountLimitBps ?? args.version.guardrails.discountLimitBps);
  const policy = {
    gstRateBps: args.baseline.gstRateBps,
    contributionFloor,
    cashAtRiskLimitPaise: numberOverride(args.overrides, "cash_exposure", args.version.guardrails.cashAtRiskLimitPaise),
    maxTenureMonths: args.version.guardrails.maxTenureMonths,
    smallestInstalmentPaise: args.version.guardrails.smallestInstalmentPaise,
    discountLimitBps,
    paymentFeeBps: args.version.guardrails.paymentFeeBps,
    advanceNoticeDays: args.version.fixed.advanceNoticeDays,
    internalRetryAfterDays: args.version.fixed.internalRetryAfterDays,
    mandateEndBufferMonths: args.version.fixed.mandateEndBufferMonths,
  };
  // A buyer's own terms name every discount level they asked about, including those above the limit: the engine then refuses them, by name.
  const templates = args.terms
    ? { ...structuredClone(args.terms.templates), fullScope: structuredClone(args.baseline.quotedScope) }
    : {
        ...structuredClone(args.version.fixed.offerTypes),
        fullScope: structuredClone(args.baseline.quotedScope),
        discountsBps: [...args.version.discountLadderBps].filter((level) => level <= discountLimitBps).sort((a, b) => a - b),
      };
  return { merchant: { ...structuredClone(args.merchant), policy }, packages, templates };
}

export function effectiveHashOf(input: EngineInput): string {
  const exactInputs = { policy: input.merchant.policy, packages: input.packages, templates: input.templates };
  return createHash("sha256").update(canonicalJson(exactInputs), "utf8").digest("hex");
}

function floorStrength(value: ContributionFloor): [number, number, number] {
  return [value.minPercentBps ?? 0, value.minPaise ?? 0, value.combine === "both" ? 1 : 0];
}

export function overrideDirection(
  field: OverrideField,
  accountValue: number | ContributionFloor,
  value: number | ContributionFloor,
): "tightens" | "loosens" | "neutral" {
  if (typeof accountValue !== "number" || typeof value !== "number") {
    if (typeof accountValue === "number" || typeof value === "number") return "neutral";
    const before = floorStrength(accountValue);
    const after = floorStrength(value);
    if (canonicalJson(before) === canonicalJson(after)) return "neutral";
    if (after.every((part, index) => part >= before[index])) return "tightens";
    if (after.every((part, index) => part <= before[index])) return "loosens";
    return "neutral";
  }
  if (accountValue === value) return "neutral";
  const higherTightens = field === "direct_cost" || field === "contribution_floor";
  const tightens = higherTightens ? value > accountValue : value < accountValue;
  return tightens ? "tightens" : "loosens";
}
