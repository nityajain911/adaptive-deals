import { createHash } from "node:crypto";
import { canonicalJson } from "./agreement";
import type { ContributionFloor, ServicePackage, TemplateConfig } from "./types";

export const BUSINESS_ECONOMICS_SCHEMA = "adaptive-deals.business-economics.v1" as const;

export interface EconomicsGuardrails {
  contributionFloor: ContributionFloor;
  /** Maximum discount the merchant permits (the ceiling the engine checks). */
  discountLimitBps: number;
  /** Maximum cash the merchant will have paid out before being paid. */
  cashAtRiskLimitPaise: number;
  /** Minimum payment, before GST. */
  smallestInstalmentPaise: number;
  maxTenureMonths: number;
  paymentFeeBps: number;
}

/** Not editable in this work: tax and operational values, and the approved offer types. */
export interface EconomicsFixed {
  gstRateBps: number;
  advanceNoticeDays: number;
  internalRetryAfterDays: number;
  mandateEndBufferMonths: number;
  offerTypes: Omit<TemplateConfig, "discountsBps">;
}

export interface EconomicsContent {
  services: ServicePackage[];
  guardrails: EconomicsGuardrails;
  /** Discount levels the engine may generate. Each is at or below the ceiling; 0 is always present. */
  discountLadderBps: number[];
  fixed: EconomicsFixed;
}

export interface BusinessEconomics extends EconomicsContent {
  schema: typeof BUSINESS_ECONOMICS_SCHEMA;
  version: number;
  activatedAt: string;
  activatedBy: string;
  hash: string;
}

export interface EconomicsIssue {
  level: "error" | "warning";
  field: string;
  message: string;
}

export class EconomicsError extends Error {}

/** Identity of the content, independent of key order, service order and ladder order. */
export function economicsContentHash(c: EconomicsContent): string {
  const canonical = {
    services: [...c.services].sort((a, b) => a.id.localeCompare(b.id)),
    guardrails: c.guardrails,
    discountLadderBps: [...c.discountLadderBps].sort((a, b) => a - b),
    fixed: c.fixed,
  };
  return createHash("sha256").update(canonicalJson(canonical), "utf8").digest("hex");
}

const whole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

export function validateEconomics(c: EconomicsContent): EconomicsIssue[] {
  const issues: EconomicsIssue[] = [];
  const err = (field: string, message: string) => issues.push({ level: "error" as const, field, message });
  const warn = (field: string, message: string) => issues.push({ level: "warning" as const, field, message });
  const ids = c.services.map((s) => s.id);

  if (!c.services.length) err("services", "Add at least one service.");
  if (new Set(ids).size !== ids.length) err("services", "Each service needs its own id.");
  for (const service of c.services) {
    const at = `services.${service.id}`;
    if (!whole(service.listPricePaise) || service.listPricePaise <= 0) err(`${at}.listPricePaise`, "The standard price must be more than zero.");
    if (!whole(service.directCostPaise) || service.directCostPaise < 0) err(`${at}.directCostPaise`, "The direct cost cannot be negative.");
    else if (whole(service.listPricePaise) && service.directCostPaise > service.listPricePaise) warn(`${at}.directCostPaise`, "This service costs more to deliver than its standard price.");
    for (const dependency of service.dependsOnAny ?? []) {
      if (!ids.includes(dependency)) err(`${at}.dependsOnAny`, `Depends on "${dependency}", which is not one of your services.`);
    }
  }

  const guardrails = c.guardrails;
  if (!whole(guardrails.discountLimitBps) || guardrails.discountLimitBps < 0 || guardrails.discountLimitBps > 10_000) err("guardrails.discountLimitBps", "The maximum discount must be between 0% and 100%.");
  if (!whole(guardrails.cashAtRiskLimitPaise) || guardrails.cashAtRiskLimitPaise < 0) err("guardrails.cashAtRiskLimitPaise", "The maximum cash exposure cannot be negative.");
  if (!whole(guardrails.smallestInstalmentPaise) || guardrails.smallestInstalmentPaise <= 0) err("guardrails.smallestInstalmentPaise", "The minimum payment must be more than zero.");
  if (!whole(guardrails.maxTenureMonths) || guardrails.maxTenureMonths < 1) err("guardrails.maxTenureMonths", "The maximum payment duration must be at least one month.");
  if (!whole(guardrails.paymentFeeBps) || guardrails.paymentFeeBps < 0 || guardrails.paymentFeeBps > 10_000) err("guardrails.paymentFeeBps", "The expected payment fee must be between 0% and 100%.");

  const floor = guardrails.contributionFloor;
  if (floor.minPercentBps !== null && (!whole(floor.minPercentBps) || floor.minPercentBps < 0 || floor.minPercentBps > 10_000)) err("guardrails.contributionFloor", "The minimum contribution percentage must be between 0% and 100%.");
  if (floor.minPaise !== null && (!whole(floor.minPaise) || floor.minPaise < 0)) err("guardrails.contributionFloor", "The minimum contribution amount cannot be negative.");

  const ladder = c.discountLadderBps;
  if (!ladder.includes(0)) err("discountLadderBps", "The approved ladder must include 0% (no discount).");
  if (ladder.some((level) => !whole(level) || level < 0 || level > guardrails.discountLimitBps)) err("discountLadderBps", "Every approved discount must be at or below your maximum discount.");
  if (new Set(ladder).size !== ladder.length) err("discountLadderBps", "Each approved discount may appear once.");
  return issues;
}

export function activate(content: EconomicsContent, meta: { version: number; activatedAt: string; activatedBy: string }): BusinessEconomics {
  const errors = validateEconomics(content).filter((issue) => issue.level === "error");
  if (errors.length) throw new EconomicsError(errors.map((issue) => issue.message).join(" "));
  return { schema: BUSINESS_ECONOMICS_SCHEMA, ...structuredClone(content), ...meta, hash: economicsContentHash(content) };
}
