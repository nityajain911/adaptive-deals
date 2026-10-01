import type { CheckResult } from "./checks";
import { formatDate, formatDateValue, type Precision } from "./dates";
import type { AmbiguityImpact } from "./engine";
import { formatINR } from "./money";

/**
 * All user-facing explanations of checks are generated here from stable result codes and
 * verified facts. Neither the UI nor the AI writes these sentences or their figures.
 */
const inr = (f: CheckResult["facts"], k: string) => formatINR(Number(f[k]));
const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
const dates = (f: CheckResult["facts"], k: string) => (f[k] as string[]).map(formatDate).join(", ");
const monthOrDay = (f: CheckResult["facts"], vk: string, pk: string) => formatDateValue({ value: String(f[vk]), precision: f[pk] as Precision });
const plural = (f: CheckResult["facts"], k: string) => ((f[k] as string[]).length > 1 ? "Payments due" : "Payment due");
const gstBasis = (f: CheckResult["facts"]) => (f.gstIncluded === "yes" ? "incl. GST" : "excl. GST");

export function explainCheck(c: CheckResult): string {
  const f = c.facts;
  switch (c.code) {
    case "BUDGET_WITHIN_CURRENT_PERIOD":
      return `${inr(f, "duePaise")} (${gstBasis(f)}) falls due by ${formatDate(String(f.periodEnd))}, within the ${inr(f, "budgetPaise")} available this period.`;
    case "BUDGET_EXCEEDS_CURRENT_PERIOD":
      return `${inr(f, "duePaise")} (${gstBasis(f)}) falls due by ${formatDate(String(f.periodEnd))}, above the ${inr(f, "budgetPaise")} available this period.`;
    case "BUDGET_EXCEEDS_NEXT_BUDGET":
      return `${inr(f, "dueNextPaise")} falls due after the next budget opens, above the stated ${inr(f, "nextBudgetPaise")}.`;
    case "BUDGET_BASIS_UNKNOWN":
      return "Cannot check the budget until its GST basis is confirmed.";
    case "BUDGET_NOT_STATED":
      return "No current budget has been stated.";
    case "TIMING_OK":
      return f.nextBudget ? "Every payment falls inside an available budget period." : "No timing constraint applies.";
    case "PAYMENT_BEFORE_NEXT_BUDGET":
      return `${plural(f, "dueDates")} ${dates(f, "dueDates")} ${(f.dueDates as string[]).length > 1 ? "fall" : "falls"} before the buyer's next budget (${monthOrDay(f, "nextBudget", "nextBudgetPrecision")}).`;
    case "PAYMENT_DAY_UNKNOWN_IN_BUDGET_MONTH":
      return `${plural(f, "dueDates")} ${dates(f, "dueDates")} ${(f.dueDates as string[]).length > 1 ? "fall" : "falls"} inside ${monthOrDay(f, "nextBudget", "nextBudgetPrecision")}; we need the day the new budget opens.`;
    case "PAYMENT_AFTER_PERIOD_NO_NEXT_BUDGET":
      return `Payments fall after ${formatDate(String(f.periodEnd))}, but no later budget has been stated.`;
    case "START_AFTER_LATEST_START":
      return `Starts ${formatDate(String(f.startDate))}, after the buyer's latest start (${monthOrDay(f, "latestStart", "latestStartPrecision")}).`;
    case "START_DAY_UNKNOWN_IN_DEADLINE_MONTH":
      return `Starts ${formatDate(String(f.startDate))}, inside the latest-start month; we need the exact day.`;
    case "WITHIN_APPROVAL_LIMIT":
      return `Within buyer's approval limit: ${inr(f, "measuredPaise")} ${f.scope === "per_contract" ? "for the contract" : "largest payment"} vs ${inr(f, "limitPaise")} (${gstBasis(f)}).`;
    case "ABOVE_APPROVAL_LIMIT":
      return `Needs buyer's MD approval: ${inr(f, "measuredPaise")} ${f.scope === "per_contract" ? "for the contract" : "largest payment"} is above ${inr(f, "limitPaise")} (${gstBasis(f)}).`;
    case "NO_APPROVAL_LIMIT_STATED":
      return "No buyer approval limit was stated.";
    case "APPROVAL_BASIS_UNKNOWN":
      return "Cannot check the approval limit until its GST basis and scope are confirmed.";
    case "REQUIRED_PACKAGES_INCLUDED":
      return "Includes every package the buyer requires.";
    case "REQUIRED_PACKAGE_EXCLUDED":
      return `Leaves out a package the buyer requires (${(f.packageIds as string[]).join(", ")}).`;
    case "CONTRIBUTION_ABOVE_FLOOR":
    case "CONTRIBUTION_BELOW_FLOOR": {
      const floor = [Number(f.floorBps) >= 0 ? pct(Number(f.floorBps)) : null, Number(f.floorPaise) >= 0 ? inr(f, "floorPaise") : null].filter(Boolean).join(" and ");
      return `Net contribution ${inr(f, "netContributionPaise")} (${pct(Number(f.netContributionBps))} of price) is ${c.code === "CONTRIBUTION_ABOVE_FLOOR" ? "at or above" : "below"} the ${floor} floor.`;
    }
    case "CASH_AT_RISK_WITHIN_LIMIT":
      return `Peak funding requirement ${inr(f, "peakFundingPaise")} is within the ${inr(f, "limitPaise")} cash-at-risk limit.`;
    case "CASH_AT_RISK_ABOVE_LIMIT":
      return `Peak funding requirement ${inr(f, "peakFundingPaise")} on ${formatDate(String(f.peakFundingDate))} is above the ${inr(f, "limitPaise")} cash-at-risk limit.`;
    case "TENURE_WITHIN_MAX":
      return `${f.tenureMonths} months, within the ${f.maxMonths}-month maximum.`;
    case "TENURE_ABOVE_MAX":
      return `${f.tenureMonths} months, above the ${f.maxMonths}-month maximum.`;
    case "INSTALMENTS_ABOVE_MINIMUM":
      return `Smallest instalment ${inr(f, "smallestPaise")} (excl. GST) meets the ${inr(f, "minimumPaise")} minimum.`;
    case "INSTALMENT_BELOW_MINIMUM":
      return `Smallest instalment ${inr(f, "smallestPaise")} (excl. GST) is below the ${inr(f, "minimumPaise")} minimum.`;
    case "DISCOUNT_WITHIN_LIMIT":
      return Number(f.discountBps) === 0 ? "No discount." : `Discount ${pct(Number(f.discountBps))} within the ${pct(Number(f.limitBps))} limit.`;
    case "DISCOUNT_ABOVE_LIMIT":
      return `Discount ${pct(Number(f.discountBps))} is above the ${pct(Number(f.limitBps))} limit.`;
    case "SCOPE_RULES_OK":
      return "Scope follows the merchant's package rules.";
    case "SCOPE_NO_INDEPENDENT_VALUE":
      return "This phase has no package with value on its own.";
    case "SCOPE_MISSING_DEPENDENCY":
      return `A package is included without the package it depends on (${(f.packageIds as string[]).join(", ")}).`;
    case "SCOPE_PACKAGE_NOT_REMOVABLE":
      return `Leaves out a package the merchant does not allow to be removed (${(f.packageIds as string[]).join(", ")}).`;
    case "START_PACKAGE_NOT_DEFERRABLE":
      return `Defers a package the merchant does not allow to be deferred (${(f.packageIds as string[]).join(", ")}).`;
  }
}

const READING_LABEL: Record<string, string> = {
  yes: "includes GST",
  no: "excludes GST",
  per_payment: "applies per payment",
  per_contract: "applies to the whole contract",
};

export const readingLabel = (r: string) => READING_LABEL[r] ?? formatDateValue({ value: r, precision: r.length === 7 ? "month" : "day" });

/** Engine-derived "why this matters" from an ambiguity comparison. */
export function explainAmbiguity(a: AmbiguityImpact): string {
  if (!a.decisionRelevant) return "Either reading gives the same options, so this does not change the decision.";
  const parts = a.readings.map((r) => `if it ${readingLabel(r)}, ${a.feasibleCountByReading[r]} option${a.feasibleCountByReading[r] === 1 ? " is" : "s are"} feasible (${a.withinLimitCountByReading[r]} within the approval limit)`);
  const example = a.differences[0];
  const ex = example
    ? ` For example, “${example.label}” is ${example.outcomes.map((o) => `${outcomeWord(o.verdict, o.approval)} when it ${readingLabel(o.reading)}`).join(" but ")}.`
    : "";
  return `${capitalise(parts.join("; "))}. ${a.differences.length} option${a.differences.length === 1 ? " changes" : "s change"} outcome.${ex}`;
}

function outcomeWord(verdict: string, approval: string) {
  if (verdict === "feasible") return approval === "requires_approval" ? "feasible but needs MD approval" : "feasible within the limit";
  return verdict === "rejected" ? "rejected" : "undecidable";
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Short, reader-facing names for check codes (lists and summaries). */
export const SHORT_REASON: Partial<Record<string, string>> = {
  BUDGET_EXCEEDS_CURRENT_PERIOD: "payments due this period exceed the current budget",
  BUDGET_EXCEEDS_NEXT_BUDGET: "payments exceed the stated next budget",
  PAYMENT_BEFORE_NEXT_BUDGET: "a payment falls before the next budget",
  PAYMENT_DAY_UNKNOWN_IN_BUDGET_MONTH: "a payment falls inside the next-budget month (day unknown)",
  PAYMENT_AFTER_PERIOD_NO_NEXT_BUDGET: "payments fall after the period with no later budget stated",
  START_AFTER_LATEST_START: "starts after the buyer's latest start",
  START_DAY_UNKNOWN_IN_DEADLINE_MONTH: "starts inside the latest-start month (day unknown)",
  REQUIRED_PACKAGE_EXCLUDED: "leaves out a required package",
  CONTRIBUTION_BELOW_FLOOR: "net contribution below the seller's floor",
  CASH_AT_RISK_ABOVE_LIMIT: "peak funding requirement above the cash-at-risk limit",
  TENURE_ABOVE_MAX: "longer than the maximum tenure",
  INSTALMENT_BELOW_MINIMUM: "an instalment below the minimum",
  DISCOUNT_ABOVE_LIMIT: "discount above the limit",
  SCOPE_NO_INDEPENDENT_VALUE: "phase has no independent value",
  SCOPE_MISSING_DEPENDENCY: "package without its dependency",
  SCOPE_PACKAGE_NOT_REMOVABLE: "removes a package that cannot be removed",
  START_PACKAGE_NOT_DEFERRABLE: "defers a package that cannot be deferred",
};
export const shortReason = (code: string) => SHORT_REASON[code] ?? code.replace(/_/g, " ").toLowerCase();
