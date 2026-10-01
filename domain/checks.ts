import { compareDates, compareWithBudgetAvailable, compareWithDeadline, monthsInclusive } from "./dates";
import type { Economics } from "./economics";
import { sum, type Paise } from "./money";
import type { Structure } from "./structures";
import type { BuyerConstraints, MerchantPolicy, ServicePackage } from "./types";

export type CheckStatus = "pass" | "fail" | "needs_information" | "within_limit" | "requires_approval";

export type CheckId =
  | "buyer_budget"
  | "buyer_timing"
  | "buyer_approval"
  | "buyer_required_packages"
  | "seller_contribution"
  | "seller_cash_at_risk"
  | "max_tenure"
  | "smallest_instalment"
  | "discount_limit"
  | "scope_rules";

export type CheckCode =
  | "BUDGET_WITHIN_CURRENT_PERIOD"
  | "BUDGET_EXCEEDS_CURRENT_PERIOD"
  | "BUDGET_EXCEEDS_NEXT_BUDGET"
  | "BUDGET_BASIS_UNKNOWN"
  | "BUDGET_NOT_STATED"
  | "TIMING_OK"
  | "PAYMENT_BEFORE_NEXT_BUDGET"
  | "PAYMENT_DAY_UNKNOWN_IN_BUDGET_MONTH"
  | "PAYMENT_AFTER_PERIOD_NO_NEXT_BUDGET"
  | "START_AFTER_LATEST_START"
  | "START_DAY_UNKNOWN_IN_DEADLINE_MONTH"
  | "WITHIN_APPROVAL_LIMIT"
  | "ABOVE_APPROVAL_LIMIT"
  | "NO_APPROVAL_LIMIT_STATED"
  | "APPROVAL_BASIS_UNKNOWN"
  | "REQUIRED_PACKAGES_INCLUDED"
  | "REQUIRED_PACKAGE_EXCLUDED"
  | "CONTRIBUTION_ABOVE_FLOOR"
  | "CONTRIBUTION_BELOW_FLOOR"
  | "CASH_AT_RISK_WITHIN_LIMIT"
  | "CASH_AT_RISK_ABOVE_LIMIT"
  | "TENURE_WITHIN_MAX"
  | "TENURE_ABOVE_MAX"
  | "INSTALMENTS_ABOVE_MINIMUM"
  | "INSTALMENT_BELOW_MINIMUM"
  | "DISCOUNT_WITHIN_LIMIT"
  | "DISCOUNT_ABOVE_LIMIT"
  | "SCOPE_RULES_OK"
  | "SCOPE_NO_INDEPENDENT_VALUE"
  | "SCOPE_MISSING_DEPENDENCY"
  | "SCOPE_PACKAGE_NOT_REMOVABLE"
  | "START_PACKAGE_NOT_DEFERRABLE";

export type Fact = number | string | string[];

export interface CheckResult {
  id: CheckId;
  side: "buyer" | "seller";
  status: CheckStatus;
  code: CheckCode;
  /** Verified figures and dates the copy layer formats. Money facts end in `Paise`. */
  facts: Record<string, Fact>;
  /** Payment lines responsible for a fail or needs_information result. */
  lineIds: string[];
}

const check = (id: CheckId, side: CheckResult["side"], status: CheckStatus, code: CheckCode, facts: CheckResult["facts"] = {}, lineIds: string[] = []): CheckResult => ({ id, side, status, code, facts, lineIds });

export function amountOn(basis: "yes" | "no", line: { prePaise: Paise; totalPaise: Paise }): Paise {
  return basis === "yes" ? line.totalPaise : line.prePaise;
}

export function buyerChecks(s: Structure, c: BuyerConstraints): CheckResult[] {
  const out: CheckResult[] = [];
  // A GST basis applies to an amount only if it was explicitly confirmed for that amount.
  const basisFor = (f: "budgetNow" | "approvalLimit") => (c.gstBasis?.covers.includes(f) ? c.amountsIncludeGst : null);
  const basis = basisFor("budgetNow");

  // Budget in the current period, and in the next budget if an amount was stated.
  if (!c.budgetNow) out.push(check("buyer_budget", "buyer", "needs_information", "BUDGET_NOT_STATED"));
  else if (!basis) out.push(check("buyer_budget", "buyer", "needs_information", "BUDGET_BASIS_UNKNOWN"));
  else {
    const { start, end } = c.budgetNow.period;
    const inPeriod = s.payments.filter((p) => compareDates(p.dueDate, start) >= 0 && compareDates(p.dueDate, end) <= 0);
    const due = sum(inPeriod.map((p) => amountOn(basis, p)));
    const facts = { duePaise: due, budgetPaise: c.budgetNow.amountPaise, periodStart: start, periodEnd: end, gstIncluded: basis, gstBasisSource: c.gstBasis!.source };
    if (due > c.budgetNow.amountPaise) out.push(check("buyer_budget", "buyer", "fail", "BUDGET_EXCEEDS_CURRENT_PERIOD", facts, inPeriod.map((p) => p.id)));
    else if (c.nextBudget?.amountPaise != null) {
      const after = s.payments.filter((p) => compareWithBudgetAvailable(p.dueDate, c.nextBudget!.available) !== "fail" && compareDates(p.dueDate, end) > 0);
      const dueNext = sum(after.map((p) => amountOn(basis, p)));
      if (dueNext > c.nextBudget.amountPaise) out.push(check("buyer_budget", "buyer", "fail", "BUDGET_EXCEEDS_NEXT_BUDGET", { ...facts, dueNextPaise: dueNext, nextBudgetPaise: c.nextBudget.amountPaise }, after.map((p) => p.id)));
      else out.push(check("buyer_budget", "buyer", "pass", "BUDGET_WITHIN_CURRENT_PERIOD", facts));
    } else out.push(check("buyer_budget", "buyer", "pass", "BUDGET_WITHIN_CURRENT_PERIOD", facts));
  }

  // Timing: payments after the current period must fall after the next budget becomes available.
  const timing: CheckResult[] = [];
  if (c.budgetNow) {
    const later = s.payments.filter((p) => compareDates(p.dueDate, c.budgetNow!.period.end) > 0);
    if (later.length && !c.nextBudget) {
      timing.push(check("buyer_timing", "buyer", "needs_information", "PAYMENT_AFTER_PERIOD_NO_NEXT_BUDGET", { periodEnd: c.budgetNow.period.end }, later.map((p) => p.id)));
    } else if (c.nextBudget) {
      const results = later.map((p) => ({ p, r: compareWithBudgetAvailable(p.dueDate, c.nextBudget!.available) }));
      const failing = results.filter((x) => x.r === "fail").map((x) => x.p);
      const undecidable = results.filter((x) => x.r === "undecidable").map((x) => x.p);
      const gapFacts = {
        gapFrom: c.budgetGap?.from ?? "",
        nextBudget: c.nextBudget.available.value,
        nextBudgetPrecision: c.nextBudget.available.precision,
      };
      if (failing.length) timing.push(check("buyer_timing", "buyer", "fail", "PAYMENT_BEFORE_NEXT_BUDGET", { ...gapFacts, dueDates: failing.map((p) => p.dueDate) }, failing.map((p) => p.id)));
      if (undecidable.length) timing.push(check("buyer_timing", "buyer", "needs_information", "PAYMENT_DAY_UNKNOWN_IN_BUDGET_MONTH", { ...gapFacts, dueDates: undecidable.map((p) => p.dueDate) }, undecidable.map((p) => p.id)));
    }
  }
  if (c.latestStart) {
    const r = compareWithDeadline(s.startDate, c.latestStart);
    const facts = { startDate: s.startDate, latestStart: c.latestStart.value, latestStartPrecision: c.latestStart.precision };
    if (r === "fail") timing.push(check("buyer_timing", "buyer", "fail", "START_AFTER_LATEST_START", facts));
    if (r === "undecidable") timing.push(check("buyer_timing", "buyer", "needs_information", "START_DAY_UNKNOWN_IN_DEADLINE_MONTH", facts));
  }
  out.push(...(timing.length ? timing : [check("buyer_timing", "buyer", "pass", "TIMING_OK", { nextBudget: c.nextBudget?.available.value ?? "" })]));

  // Approval: an approval requirement, never a prohibition.
  if (!c.approvalLimit) out.push(check("buyer_approval", "buyer", "within_limit", "NO_APPROVAL_LIMIT_STATED"));
  else if (!basisFor("approvalLimit") || !c.approvalScope) out.push(check("buyer_approval", "buyer", "needs_information", "APPROVAL_BASIS_UNKNOWN"));
  else {
    const ab = basisFor("approvalLimit")!;
    const measured = c.approvalScope === "per_contract" ? sum(s.payments.map((p) => amountOn(ab, p))) : Math.max(...s.payments.map((p) => amountOn(ab, p)));
    const facts = { measuredPaise: measured, limitPaise: c.approvalLimit.amountPaise, scope: c.approvalScope, gstIncluded: ab, gstBasisSource: c.gstBasis!.source };
    out.push(measured > c.approvalLimit.amountPaise ? check("buyer_approval", "buyer", "requires_approval", "ABOVE_APPROVAL_LIMIT", facts) : check("buyer_approval", "buyer", "within_limit", "WITHIN_APPROVAL_LIMIT", facts));
  }

  if (c.requiredPackages.length) {
    const missing = c.requiredPackages.filter((id) => !s.scope.some((x) => x.packageId === id));
    out.push(missing.length ? check("buyer_required_packages", "buyer", "fail", "REQUIRED_PACKAGE_EXCLUDED", { packageIds: missing }) : check("buyer_required_packages", "buyer", "pass", "REQUIRED_PACKAGES_INCLUDED"));
  }
  return out;
}

export function sellerChecks(s: Structure, e: Economics, policy: MerchantPolicy, packages: ServicePackage[]): CheckResult[] {
  const out: CheckResult[] = [];
  const f = policy.contributionFloor;
  const pctOk = f.minPercentBps === null || e.netContributionBps >= f.minPercentBps;
  const absOk = f.minPaise === null || e.netContributionPaise >= f.minPaise;
  const applied = [f.minPercentBps !== null ? pctOk : null, f.minPaise !== null ? absOk : null].filter((x): x is boolean => x !== null);
  const ok = applied.length === 0 || (f.combine === "both" ? applied.every(Boolean) : applied.some(Boolean));
  const cf = { netContributionPaise: e.netContributionPaise, netContributionBps: e.netContributionBps, floorBps: f.minPercentBps ?? -1, floorPaise: f.minPaise ?? -1, grossContributionPaise: e.grossContributionPaise, feesPaise: e.expectedFeesPaise };
  out.push(check("seller_contribution", "seller", ok ? "pass" : "fail", ok ? "CONTRIBUTION_ABOVE_FLOOR" : "CONTRIBUTION_BELOW_FLOOR", cf));

  const rf = { peakFundingPaise: e.peakFundingPaise, peakFundingDate: e.peakFundingDate ?? "", limitPaise: policy.cashAtRiskLimitPaise };
  out.push(e.peakFundingPaise <= policy.cashAtRiskLimitPaise ? check("seller_cash_at_risk", "seller", "pass", "CASH_AT_RISK_WITHIN_LIMIT", rf) : check("seller_cash_at_risk", "seller", "fail", "CASH_AT_RISK_ABOVE_LIMIT", rf));

  const lastDelivery = s.deliveries.map((d) => d.month).sort(compareDates).at(-1)!;
  const lastPayment = s.payments.map((p) => p.dueDate).sort(compareDates).at(-1)!;
  const end = compareDates(lastPayment.slice(0, 7), lastDelivery) > 0 ? lastPayment.slice(0, 7) : lastDelivery;
  const tenure = monthsInclusive(s.startDate, end);
  const tf = { tenureMonths: tenure, maxMonths: policy.maxTenureMonths };
  out.push(tenure <= policy.maxTenureMonths ? check("max_tenure", "seller", "pass", "TENURE_WITHIN_MAX", tf) : check("max_tenure", "seller", "fail", "TENURE_ABOVE_MAX", tf));

  const small = s.payments.filter((p) => p.prePaise < policy.smallestInstalmentPaise);
  const sf = { smallestPaise: Math.min(...s.payments.map((p) => p.prePaise)), minimumPaise: policy.smallestInstalmentPaise };
  out.push(small.length ? check("smallest_instalment", "seller", "fail", "INSTALMENT_BELOW_MINIMUM", sf, small.map((p) => p.id)) : check("smallest_instalment", "seller", "pass", "INSTALMENTS_ABOVE_MINIMUM", sf));

  const df = { discountBps: s.discountBps, limitBps: policy.discountLimitBps };
  out.push(s.discountBps <= policy.discountLimitBps ? check("discount_limit", "seller", "pass", "DISCOUNT_WITHIN_LIMIT", df) : check("discount_limit", "seller", "fail", "DISCOUNT_ABOVE_LIMIT", df));

  out.push(scopeRules(s, packages));
  return out;
}

function scopeRules(s: Structure, packages: ServicePackage[]): CheckResult {
  const byId = new Map(packages.map((p) => [p.id, p]));
  const included = s.scope.map((x) => byId.get(x.packageId)!);
  const notRemovable = s.excludedPackageIds.filter((id) => !byId.get(id)!.removable);
  if (notRemovable.length) return check("scope_rules", "seller", "fail", "SCOPE_PACKAGE_NOT_REMOVABLE", { packageIds: notRemovable });
  if (s.scopeKind === "phase_1" && !included.some((p) => p.hasIndependentValue)) {
    return check("scope_rules", "seller", "fail", "SCOPE_NO_INDEPENDENT_VALUE", { packageIds: included.map((p) => p.id) });
  }
  const missingDep = included.filter((p) => p.dependsOnAny?.length && !p.dependsOnAny.some((d) => included.some((q) => q.id === d)));
  if (missingDep.length) return check("scope_rules", "seller", "fail", "SCOPE_MISSING_DEPENDENCY", { packageIds: missingDep.map((p) => p.id) });
  if (s.template === "deferred_start") {
    const notDeferrable = included.filter((p) => !p.deferrable);
    if (notDeferrable.length) return check("scope_rules", "seller", "fail", "START_PACKAGE_NOT_DEFERRABLE", { packageIds: notDeferrable.map((p) => p.id) });
  }
  return check("scope_rules", "seller", "pass", "SCOPE_RULES_OK");
}
