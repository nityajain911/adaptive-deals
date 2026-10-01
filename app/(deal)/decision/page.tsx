import { explainCheck, shortReason } from "@/domain/copy";
import { formatDate } from "@/domain/dates";
import { failingChecks, featuredRejections, type EvaluatedStructure } from "@/domain/engine";
import { formatINR } from "@/domain/money";
import { ApproveAndSend } from "@/components/client";
import { RuleRef, AppliedRules } from "@/components/rules";
import { ApprovalBadge, Checks, PaymentTable, StructureCard } from "@/components/structure-card";
import { Badge, Card, Empty, Notice, Stat, cx } from "@/components/ui";
import { heroPackages, heroTemplates } from "@/data/synthetic/hero";
import { loadPage } from "@/lib/page-data";
import { explanationAttribution } from "@/lib/views";

const pkgName = (id: string) => heroPackages.find((p) => p.id === id)?.name ?? id;
const scopeLine = (x: EvaluatedStructure) => x.structure.scope.map((i) => `${pkgName(i.packageId)}${i.months > 1 ? ` (${i.months} months)` : ""}`).join(", ");
const check = (x: EvaluatedStructure, id: string) => [...x.buyerChecks, ...x.sellerChecks].find((c) => c.id === id);
const ok = (s?: string) => s === "pass" || s === "within_limit";

export default async function DecisionPage() {
  const { s, out } = await loadPage();
  const r = out.evaluation.result;
  const policy = s.run.record.inputs.policy;
  if (!r) {
    return (
      <Notice tone="amber" title="No options yet">
        The engine evaluates structures once every decision-relevant fact is confirmed. Current deal status: {s.status.replace(/_/g, " ")}.
      </Notice>
    );
  }
  const exp = out.explanation;
  const order = exp?.order ?? r.feasible.map((x) => x.structure.id);
  const feasible = order.map((id) => r.feasible.find((x) => x.structure.id === id)!).filter(Boolean);
  const top = feasible[0];
  const alternatives = feasible.slice(1);
  const featured = featuredRejections(r);
  const actionable = s.status === "options_ready";
  const common = { limitPaise: policy.cashAtRiskLimitPaise, floorBps: policy.contributionFloor.minPercentBps };
  const aiText = exp?.source.text === "ai";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-bold tracking-tight text-ink">Recommended structure</h2>
          <p className="mt-1 text-[13px] text-muted">
            {r.structures.length} structures across {r.templatesEvaluated.length} templates evaluated · {r.feasible.length} feasible · {r.rejected.length} rejected · {r.needsInformation.length} need information
          </p>
        </div>
        <AppliedRules policy={policy} templates={heroTemplates} packages={heroPackages} />
      </div>

      {!top ? <Empty>No feasible structure. Nothing can be approved.</Empty> : null}
      {top ? (
        <Card as="article" className="overflow-hidden border-[#c7d3ff] shadow-[0_0_0_3px_var(--blue-weak)]" data-testid="recommendation">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="blue">Recommended</Badge>
                <ApprovalBadge approval={top.approval} />
              </div>
              <h3 className="mt-2 text-[18px] font-semibold text-ink">{top.structure.label}</h3>
            </div>
            {actionable && top.approvable ? <ApproveAndSend structureId={top.structure.id} label={top.structure.label} /> : null}
          </div>
          <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <div className="space-y-4">
              <dl className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Included</dt>
                  <dd className="mt-0.5 text-ink">{scopeLine(top)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Not included</dt>
                  <dd className="mt-0.5 text-ink">{top.structure.excludedPackageIds.length ? top.structure.excludedPackageIds.map(pkgName).join(", ") : "Nothing"}</dd>
                </div>
              </dl>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Buyer payment schedule</div>
                <PaymentTable x={top} />
              </div>
            </div>
            <div className="space-y-3">
              <Metric
                label="Projected contribution"
                value={formatINR(top.economics.netContributionPaise)}
                hint={`${(top.economics.netContributionBps / 100).toFixed(2)}% of price · ${ok(check(top, "seller_contribution")?.status) ? "meets" : "below"} the floor`}
                good={ok(check(top, "seller_contribution")?.status)}
                testId="rec-contribution"
              />
              <Metric
                label="Peak funding requirement"
                value={formatINR(top.economics.peakFundingPaise)}
                hint={`${ok(check(top, "seller_cash_at_risk")?.status) ? "Within" : "Above"} the ${formatINR(policy.cashAtRiskLimitPaise)} cash-at-risk limit`}
                good={ok(check(top, "seller_cash_at_risk")?.status)}
                testId="rec-funding"
              />
              <Metric label="Buyer approval" value={top.approval === "within_limit" ? "Within limit" : "Needs MD approval"} hint={check(top, "buyer_approval") ? explainCheck(check(top, "buyer_approval")!) : ""} good={top.approval === "within_limit"} />
            </div>
          </div>
          <div className="border-t border-line bg-surface-muted px-5 py-4" data-testid="why-recommended">
            <h4 className="text-[13px] font-semibold text-ink">Why this structure is recommended</h4>
            {aiText ? (
              <p className="mt-1 text-[13px] leading-6 text-ink-2">{exp!.notes.find((n) => n.structureId === top.structure.id)?.text ?? exp!.comparison}</p>
            ) : (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] leading-6 text-ink-2">
                <li>Passes the buyer&apos;s budget, timing and required-package checks.</li>
                {["buyer_approval", "seller_contribution", "seller_cash_at_risk"].map((id) => {
                  const c = check(top, id);
                  return c ? <li key={id}>{explainCheck(c)}</li> : null;
                })}
                <li>
                  Ranked first: options within the buyer&apos;s approval limit come before those needing approval
                  {exp?.source.ranking === "ai" ? "; the order among them was suggested by AI and checked by code" : ""}.
                </li>
              </ul>
            )}
            <p className="mt-2 text-[12px] text-muted" data-testid="attribution">
              {explanationAttribution(exp?.source ?? null)}
            </p>
          </div>
        </Card>
      ) : null}

      {alternatives.length ? (
        <section aria-labelledby="alternatives">
          <h2 id="alternatives" className="mb-2 text-[16px] font-semibold text-ink">
            Alternatives
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface" data-testid="alternatives">
            {alternatives.map((x, i) => (
              <li key={x.structure.id} data-testid={`alternative-${i + 1}`}>
                <details className="group">
                  <summary className="grid cursor-pointer list-none grid-cols-1 gap-2 px-5 py-3 text-[13px] sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:gap-5 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">
                      <span className="font-semibold text-ink">{x.structure.label}</span>
                      <span className="mt-0.5 block">
                        <ApprovalBadge approval={x.approval} />
                      </span>
                    </span>
                    <span className="tabular text-ink-2">
                      <span className="text-muted sm:hidden">Total </span>
                      {formatINR(x.structure.payments.reduce((a, p) => a + p.totalPaise, 0))} · {x.structure.payments.length} payment{x.structure.payments.length === 1 ? "" : "s"}
                    </span>
                    <span className="tabular text-ink-2">Projected contribution {formatINR(x.economics.netContributionPaise)}</span>
                    <span className="font-semibold text-blue">
                      <span className="group-open:hidden">View details</span>
                      <span className="hidden group-open:inline">Hide details</span>
                    </span>
                  </summary>
                  <div className="border-t border-line bg-surface-muted p-3">
                    <StructureCard x={x} rank={i + 2} note={aiText ? exp?.notes.find((n) => n.structureId === x.structure.id)?.text : undefined} actionable={actionable} {...common} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="rejected" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="rejected" className="text-[16px] font-semibold text-ink">
            Not approvable
          </h2>
          <Badge tone="red">Rejected and needs-information structures cannot be approved</Badge>
        </div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {[featured.buyer, featured.seller].filter((x): x is EvaluatedStructure => !!x).map((x) => (
            <Card as="article" key={x.structure.id} className="border-[#f6cfc9] px-5 py-4" data-testid={x === featured.buyer ? "featured-buyer-rejection" : "featured-seller-rejection"}>
              <Badge tone="red">{x === featured.buyer ? "Rejected · the buyer can't carry it out" : "Rejected · the seller can't afford it"}</Badge>
              <h3 className="mt-2 text-[14px] font-semibold text-ink">{x.structure.label}</h3>
              <ul className="mt-1 space-y-1 text-[13px] text-red">
                {failingChecks(x).map((c, i) => (
                  <li key={i}>
                    ✕ {explainCheck(c)} {c.side === "seller" ? <RuleRef check={c.id} /> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      <details className="rounded-[var(--radius-card)] border border-line bg-surface" data-testid="view-details">
        <summary className="cursor-pointer px-5 py-3 text-[14px] font-semibold text-ink">View details: full checks, calculations and every rejected structure</summary>
        <div className="space-y-6 border-t border-line p-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Templates evaluated" value={r.templatesEvaluated.length} hint="of 4 merchant-approved" />
            <Stat label="Structures evaluated" value={r.structures.length} hint="none removed before checks" />
            <Stat label="Feasible" value={r.feasible.length} tone="good" />
            <Stat label="Rejected" value={r.rejected.length} tone="bad" />
            <Stat label="Needs information" value={r.needsInformation.length} tone="warn" />
          </div>
          {top ? (
            <div>
              <h3 className="mb-2 text-[14px] font-semibold text-ink">Recommended structure: checks and calculations</h3>
              <StructureCard x={top} rank={1} actionable={false} testId="feasible-1" {...common} />
            </div>
          ) : null}
          {[featured.buyer, featured.seller].filter((x): x is EvaluatedStructure => !!x).map((x) => (
            <div key={x.structure.id} className="rounded-xl border border-line p-4">
              <h3 className="text-[13px] font-semibold text-ink">{x.structure.label}</h3>
              <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <PaymentTable x={x} />
                <Checks title={x === featured.buyer ? "Buyer checks" : "Seller checks"} checks={x === featured.buyer ? x.buyerChecks : x.sellerChecks} />
              </div>
              <div className="mt-2 text-[12px] text-muted">
                Projected contribution {formatINR(x.economics.netContributionPaise)} · peak funding requirement {formatINR(x.economics.peakFundingPaise)}
                {x.economics.peakFundingDate ? ` on ${formatDate(x.economics.peakFundingDate)}` : ""} · peak unpaid service value {formatINR(x.economics.peakUnpaidServiceValuePaise)}
              </div>
            </div>
          ))}
          <div>
            <h3 className="mb-2 text-[14px] font-semibold text-ink">All {r.rejected.length} rejected structures</h3>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {r.rejected.map((x) => {
                const fails = failingChecks(x);
                const sellerRules = [...new Set(fails.filter((c) => c.side === "seller").map((c) => c.id))];
                return (
                  <li key={x.structure.id} className="px-4 py-2.5 text-[13px]" data-testid="rejected-row">
                    <div className="font-semibold text-ink">{x.structure.label}</div>
                    <div className="mt-0.5 text-red">{[...new Set(fails.map((c) => shortReason(c.code)))].join("; ")}</div>
                    {sellerRules.length ? (
                      <div className="mt-0.5 flex flex-wrap gap-3">
                        {sellerRules.map((id) => (
                          <RuleRef key={id} check={id} />
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
          {r.needsInformation.length ? (
            <div>
              <h3 className="mb-2 text-[14px] font-semibold text-ink">Needs information (not approvable until resolved)</h3>
              <ul className="space-y-2">
                {r.needsInformation.map((x) => (
                  <li key={x.structure.id} className="rounded-xl border border-line px-4 py-2.5 text-[13px]">
                    <div className="font-semibold text-ink">{x.structure.label}</div>
                    <ul className="mt-1 text-amber">
                      {[...x.buyerChecks, ...x.sellerChecks].filter((c) => c.status === "needs_information").map((c, i) => (
                        <li key={i}>? {explainCheck(c)}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {exp ? (
            <div className="rounded-xl border border-line p-4 text-[13px] leading-6 text-ink-2" data-testid="comparison">
              <div className="mb-1 text-[12px] font-semibold text-muted">Option comparison · {exp.source.text === "ai" ? "written by AI" : "written by code"} · figures filled by code</div>
              {exp.comparison}
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function Metric({ label, value, hint, good, testId }: { label: string; value: string; hint: string; good: boolean; testId?: string }) {
  return (
    <div className="rounded-xl border border-line px-4 py-3" data-testid={testId}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="tabular mt-0.5 text-[20px] font-semibold text-ink">{value}</div>
      <div className={cx("text-[12px]", good ? "text-green" : "text-amber")}>{hint}</div>
    </div>
  );
}
