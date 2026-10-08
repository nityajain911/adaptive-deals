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
      return `Payments due by ${formatDate(String(f.periodEnd))} come to ${inr(f, "duePaise")} (${gstBasis(f)}), within their ${inr(f, "budgetPaise")} budget.`;
    case "BUDGET_EXCEEDS_CURRENT_PERIOD":
      return `Payments due by ${formatDate(String(f.periodEnd))} come to ${inr(f, "duePaise")} (${gstBasis(f)}), above their ${inr(f, "budgetPaise")} budget.`;
    case "BUDGET_EXCEEDS_NEXT_BUDGET":
      return `${inr(f, "dueNextPaise")} falls due after their next budget opens, more than the ${inr(f, "nextBudgetPaise")} they mentioned.`;
    case "BUDGET_BASIS_UNKNOWN":
      return "We can't check their budget until we know whether it includes GST.";
    case "BUDGET_NOT_STATED":
      return "They haven't said what their budget is.";
    case "TIMING_OK":
      return f.nextBudget ? "Every payment falls when they have budget." : "No timing limit applies.";
    case "PAYMENT_BEFORE_NEXT_BUDGET":
      return `${plural(f, "dueDates")} ${dates(f, "dueDates")} ${(f.dueDates as string[]).length > 1 ? "fall" : "falls"} before their next budget (${monthOrDay(f, "nextBudget", "nextBudgetPrecision")}).`;
    case "PAYMENT_DAY_UNKNOWN_IN_BUDGET_MONTH":
      return `${plural(f, "dueDates")} ${dates(f, "dueDates")} ${(f.dueDates as string[]).length > 1 ? "fall" : "falls"} in ${monthOrDay(f, "nextBudget", "nextBudgetPrecision")}; we need to know the day their new budget opens.`;
    case "PAYMENT_AFTER_PERIOD_NO_NEXT_BUDGET":
      return `Payments fall after ${formatDate(String(f.periodEnd))}, and they haven't said when more budget arrives.`;
    case "START_AFTER_LATEST_START":
      return `Starts ${formatDate(String(f.startDate))}, after the latest start they allow (${monthOrDay(f, "latestStart", "latestStartPrecision")}).`;
    case "START_DAY_UNKNOWN_IN_DEADLINE_MONTH":
      return `Starts ${formatDate(String(f.startDate))}, in the month of their deadline; we need the exact day.`;
    case "WITHIN_APPROVAL_LIMIT":
      return `Within their approval limit: ${inr(f, "measuredPaise")} ${f.scope === "per_contract" ? "for the whole deal" : "for the biggest payment"}, against a limit of ${inr(f, "limitPaise")} (${gstBasis(f)}).`;
    case "ABOVE_APPROVAL_LIMIT":
      return `Needs their MD's approval: ${inr(f, "measuredPaise")} ${f.scope === "per_contract" ? "for the whole deal" : "for the biggest payment"} is above their limit of ${inr(f, "limitPaise")} (${gstBasis(f)}).`;
    case "NO_APPROVAL_LIMIT_STATED":
      return "They haven't mentioned an approval limit.";
    case "APPROVAL_BASIS_UNKNOWN":
      return "We can't check their approval limit until we know whether it includes GST, and whether it is per payment or for the whole deal.";
    case "REQUIRED_PACKAGES_INCLUDED":
      return "Includes everything they need.";
    case "REQUIRED_PACKAGE_EXCLUDED":
      return `Leaves out something they need (${(f.packageIds as string[]).join(", ")}).`;
    case "CONTRIBUTION_ABOVE_FLOOR":
    case "CONTRIBUTION_BELOW_FLOOR": {
      const floor = [Number(f.floorBps) >= 0 ? pct(Number(f.floorBps)) : null, Number(f.floorPaise) >= 0 ? inr(f, "floorPaise") : null].filter(Boolean).join(" and ");
      return `You'd keep ${inr(f, "netContributionPaise")} (${pct(Number(f.netContributionBps))} of the price), which is ${c.code === "CONTRIBUTION_ABOVE_FLOOR" ? "at or above" : "below"} your lowest profit of ${floor}.`;
    }
    case "CASH_AT_RISK_WITHIN_LIMIT":
      return `The most you'd spend before being paid is ${inr(f, "peakFundingPaise")}, within your ${inr(f, "limitPaise")} limit.`;
    case "CASH_AT_RISK_ABOVE_LIMIT":
      return `The most you'd spend before being paid is ${inr(f, "peakFundingPaise")} on ${formatDate(String(f.peakFundingDate))}, above your ${inr(f, "limitPaise")} limit.`;
    case "TENURE_WITHIN_MAX":
      return `${f.tenureMonths} months to be paid in full, within your ${f.maxMonths}-month limit.`;
    case "TENURE_ABOVE_MAX":
      return `${f.tenureMonths} months to be paid in full, above your ${f.maxMonths}-month limit.`;
    case "INSTALMENTS_ABOVE_MINIMUM":
      return `Smallest payment ${inr(f, "smallestPaise")} (before GST) meets your minimum of ${inr(f, "minimumPaise")}.`;
    case "INSTALMENT_BELOW_MINIMUM":
      return `Smallest payment ${inr(f, "smallestPaise")} (before GST) is below your minimum of ${inr(f, "minimumPaise")}.`;
    case "DISCOUNT_WITHIN_LIMIT":
      return Number(f.discountBps) === 0 ? "No discount." : `Discount of ${pct(Number(f.discountBps))} is within your ${pct(Number(f.limitBps))} limit.`;
    case "DISCOUNT_ABOVE_LIMIT":
      return `Discount of ${pct(Number(f.discountBps))} is above your ${pct(Number(f.limitBps))} limit.`;
    case "SCOPE_RULES_OK":
      return "Follows your package rules.";
    case "SCOPE_NO_INDEPENDENT_VALUE":
      return "This starter package has nothing the buyer can use on its own.";
    case "SCOPE_MISSING_DEPENDENCY":
      return `Includes a service without the one it needs (${(f.packageIds as string[]).join(", ")}).`;
    case "SCOPE_PACKAGE_NOT_REMOVABLE":
      return `Leaves out a service you've said can't be left out (${(f.packageIds as string[]).join(", ")}).`;
    case "START_PACKAGE_NOT_DEFERRABLE":
      return `Delays a service you've said can't start later (${(f.packageIds as string[]).join(", ")}).`;
  }
}

const READING_LABEL: Record<string, string> = {
  yes: "includes GST",
  no: "excludes GST",
  per_payment: "applies per payment",
  per_contract: "applies to the whole contract",
};

export const readingLabel = (r: string) => READING_LABEL[r] ?? formatDateValue({ value: r, precision: r.length === 7 ? "month" : "day" });

/** Engine-derived "why this matters" from an ambiguity comparison. This text is also the engine comparison sent to the clarification model, so it is kept stable: changing it changes recorded inputs. */
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
  BUDGET_EXCEEDS_CURRENT_PERIOD: "payments due this period are more than their budget",
  BUDGET_EXCEEDS_NEXT_BUDGET: "payments are more than their next budget",
  PAYMENT_BEFORE_NEXT_BUDGET: "a payment falls before their next budget",
  PAYMENT_DAY_UNKNOWN_IN_BUDGET_MONTH: "a payment falls in the month their budget opens (day not known)",
  PAYMENT_AFTER_PERIOD_NO_NEXT_BUDGET: "payments fall after this period, with no later budget mentioned",
  START_AFTER_LATEST_START: "starts after the latest start they allow",
  START_DAY_UNKNOWN_IN_DEADLINE_MONTH: "starts in the month of their deadline (day not known)",
  REQUIRED_PACKAGE_EXCLUDED: "leaves out something they need",
  CONTRIBUTION_BELOW_FLOOR: "you'd keep less than your lowest profit",
  CASH_AT_RISK_ABOVE_LIMIT: "you'd spend more than your limit before being paid",
  TENURE_ABOVE_MAX: "takes longer to pay than you allow",
  INSTALMENT_BELOW_MINIMUM: "a payment is smaller than your minimum",
  DISCOUNT_ABOVE_LIMIT: "discount is above your limit",
  SCOPE_NO_INDEPENDENT_VALUE: "the starter package has nothing useful on its own",
  SCOPE_MISSING_DEPENDENCY: "a service is included without the one it needs",
  SCOPE_PACKAGE_NOT_REMOVABLE: "leaves out a service that can't be left out",
  START_PACKAGE_NOT_DEFERRABLE: "delays a service that can't start later",
};
export const shortReason = (code: string) => SHORT_REASON[code] ?? code.replace(/_/g, " ").toLowerCase();
