import type { CheckId } from "@/domain/checks";
import { formatINR } from "@/domain/money";
import type { MerchantPolicy, ServicePackage, TemplateConfig } from "@/domain/types";
import { RuleLink, RulesDrawer } from "./client";
import { Badge } from "./ui";

/** Which merchant rule binds each seller-side check. */
export const RULE_FOR_CHECK: Partial<Record<CheckId, { id: string; name: string }>> = {
  seller_contribution: { id: "contribution_floor", name: "Contribution floor" },
  seller_cash_at_risk: { id: "cash_at_risk", name: "Cash-at-risk limit" },
  max_tenure: { id: "max_tenure", name: "Maximum tenure" },
  smallest_instalment: { id: "smallest_instalment", name: "Smallest instalment" },
  discount_limit: { id: "discount", name: "Discount policy" },
  scope_rules: { id: "package_rules", name: "Package rules" },
};

const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;

export function RuleRef({ check }: { check: CheckId }) {
  const r = RULE_FOR_CHECK[check];
  if (!r) return null;
  return (
    <span className="text-[12px]">
      Rule: <RuleLink ruleId={r.id}>{r.name}</RuleLink>
    </span>
  );
}

/** The merchant's applied rules, read from the active fixture configuration. Read-only. */
export function AppliedRules({ policy, templates, packages }: { policy: MerchantPolicy; templates: TemplateConfig; packages: ServicePackage[] }) {
  const floor = [policy.contributionFloor.minPercentBps !== null ? `${pct(policy.contributionFloor.minPercentBps)} of the accepted price (excl. GST)` : null, policy.contributionFloor.minPaise !== null ? formatINR(policy.contributionFloor.minPaise) : null].filter(Boolean).join(policy.contributionFloor.combine === "both" ? " and " : " or ");
  const enabled = (
    [
      ["Split payment", templates.split_payment.enabled, templates.split_payment.plans.map((p) => p.label)],
      ["Phased scope", templates.phased_scope.enabled, templates.phased_scope.phase1Scopes.map((p) => p.label)],
      ["Deferred start", templates.deferred_start.enabled, templates.deferred_start.startDates],
      ["Shorter commitment", templates.shorter_commitment.enabled, templates.shorter_commitment.terms.map((t) => `${t.termMonths} months`)],
    ] as const
  ).filter(([, on]) => on);
  const rules: { id: string; name: string; value: string; detail: string }[] = [
    { id: "contribution_floor", name: "Contribution floor", value: floor, detail: "Projected net contribution after direct costs and expected payment fees must reach this." },
    { id: "cash_at_risk", name: "Cash-at-risk limit", value: formatINR(policy.cashAtRiskLimitPaise), detail: "Peak funding requirement (costs paid before cash arrives) may not exceed this." },
    { id: "templates", name: "Permitted structure templates", value: `${enabled.length} of 4`, detail: enabled.map(([n, , xs]) => `${n}: ${xs.join(", ")}`).join(" · ") },
    { id: "max_tenure", name: "Maximum tenure", value: `${policy.maxTenureMonths} months`, detail: "From delivery start to the later of the last delivery and the last payment." },
    { id: "smallest_instalment", name: "Smallest instalment", value: `${formatINR(policy.smallestInstalmentPaise)} excl. GST`, detail: "No payment line may be smaller." },
    { id: "discount", name: "Discount policy", value: policy.discountLimitBps === 0 ? "No discount" : `Up to ${pct(policy.discountLimitBps)}`, detail: `Discount levels templates may use: ${templates.discountsBps.map(pct).join(", ")}.` },
    {
      id: "package_rules",
      name: "Package separability and independent value",
      value: `${packages.length} packages`,
      detail: packages
        .map((p) => `${p.name}: ${p.removable ? "removable" : "not removable"}, ${p.deferrable ? "deferrable" : "not deferrable"}, ${p.hasIndependentValue ? "has value on its own" : "no value on its own"}${p.dependsOnAny?.length ? `, needs ${p.dependsOnAny.map((d) => packages.find((x) => x.id === d)?.name ?? d).join(" or ")}` : ""}`)
        .join(" · "),
    },
  ];
  return (
    <RulesDrawer>
      <p className="text-[12px] text-muted">From the merchant&apos;s configuration (synthetic fixture). Read-only in this prototype; seller-side rejections link here.</p>
      {rules.map((r) => (
        <div key={r.id} tabIndex={-1} data-rule={r.id} className="rule-item rounded-xl border border-line p-3 outline-none">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-ink">{r.name}</h3>
            <Badge tone="neutral" className="tabular">
              {r.value}
            </Badge>
          </div>
          <p className="mt-1 text-[12px] leading-5 text-ink-2">{r.detail}</p>
        </div>
      ))}
    </RulesDrawer>
  );
}
