import { Info } from "lucide-react";
import { explainCheck } from "@/domain/copy";
import { formatDate } from "@/domain/dates";
import { failingChecks, featuredRejections, type EnumerationResult, type EvaluatedStructure } from "@/domain/engine";
import { formatINR, sum } from "@/domain/money";
import type { MerchantPolicy } from "@/domain/types";
import type { ExplanationResult } from "@/ai/explain";
import { heroPackages } from "@/data/synthetic/hero";
import { headlineFor, offerSummary, originalProposal } from "@/lib/offer-copy";
import { explanationAttribution } from "@/lib/views";
import { OpenAudit } from "../audit/audit-drawer";
import { ActionButton } from "../client";
import { ApprovalBadge } from "../structure-card";
import { Badge } from "../ui";

const pkg = (id: string) => heroPackages.find((p) => p.id === id)?.name ?? id;
const RULE_NAME: Partial<Record<string, string>> = {
  seller_contribution: "Contribution floor",
  seller_cash_at_risk: "Cash-at-risk limit",
  max_tenure: "Maximum tenure",
  smallest_instalment: "Smallest instalment",
  discount_limit: "Discount policy",
  scope_rules: "Package rules",
};

/** Context line from the confirmed profile, with the GST basis and approval scope kept. */
export function contextLine(budgetPaise: number | null, limitPaise: number | null, perContract: boolean): string {
  const o = originalProposal();
  const parts = [`Original annual proposal: ${formatINR(o.totalPaise)} including GST.`];
  if (budgetPaise !== null) parts.push(`The buyer has ${formatINR(budgetPaise)} including GST this quarter.`);
  if (limitPaise !== null) parts.push(`${perContract ? "Contracts" : "Payments"} above ${formatINR(limitPaise)} including GST require MD approval.`);
  return parts.join(" ");
}

/** The single recommendation (spec §5.1). Rejections and calculations stay collapsed. */
export function Recommendation({ x, exp, policy, context, primary }: { x: EvaluatedStructure; exp: ExplanationResult | null; policy: MerchantPolicy; context: string; primary: React.ReactNode }) {
  const total = sum(x.structure.payments.map((p) => p.totalPaise));
  const summary = offerSummary(x, originalProposal(), policy.gstRateBps);
  const contribution = [...x.sellerChecks].find((c) => c.id === "seller_contribution");
  const funding = [...x.sellerChecks].find((c) => c.id === "seller_cash_at_risk");
  const passesRules = contribution?.status === "pass" && funding?.status === "pass";
  const aiNote = exp?.source.text === "ai" ? exp.notes.find((n) => n.structureId === x.structure.id)?.text : null;
  const e = x.economics;
  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] border border-[#c7d3ff] bg-surface shadow-[0_0_0_3px_var(--blue-weak)]" data-testid="recommendation">
      <div className="border-b border-line px-5 py-4">
        <Badge tone="blue">Recommended offer</Badge>
        <h2 className="mt-2 text-[22px] font-bold tracking-tight text-ink" data-testid="offer-headline">
          {headlineFor(x)}
        </h2>
        <p className="mt-1 text-[13px] text-ink-2" data-testid="offer-context">
          {context}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5 px-5 py-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <div className="space-y-3">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Proposed customer total</div>
            <div className="tabular text-[30px] font-bold tracking-tight text-ink" data-testid="offer-total">
              {formatINR(total)} <span className="text-[14px] font-medium text-muted">including GST</span>
            </div>
            <div className="text-[14px] text-ink-2" data-testid="offer-payments">
              {x.structure.payments.length === 1 ? "One payment" : `${x.structure.payments.length} payments`}: {x.structure.payments.map((p) => `${formatINR(p.totalPaise)} on ${formatDate(p.dueDate)}`).join(", ")}
            </div>
            <div className="mt-1">
              <ApprovalBadge approval={x.approval} />
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Included</dt>
              <dd className="text-ink">{x.structure.scope.map((i) => `${pkg(i.packageId)}${i.months > 1 ? ` (${i.months} months)` : ""}`).join(", ")}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Not included</dt>
              <dd className="text-ink">{x.structure.excludedPackageIds.length ? x.structure.excludedPackageIds.map(pkg).join(", ") : "Nothing"}</dd>
            </div>
          </dl>
        </div>
        <div className="space-y-2">
          <div className="rounded-xl border border-line px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Projected contribution</div>
            <div className="tabular text-[22px] font-semibold text-ink" data-testid="offer-contribution">
              {formatINR(e.netContributionPaise)}
            </div>
            <div className="text-[12px] text-muted">A forecast from configured costs and fees, not a result.</div>
          </div>
          <p className={passesRules ? "text-[13px] font-medium text-green" : "text-[13px] font-medium text-amber"} data-testid="rules-result">
            {passesRules ? "Passes your configured contribution and funding rules." : "Review the applied rules before sending."}
          </p>
          <details className="rounded-xl border border-line px-4 py-2" data-testid="see-economics">
            <summary className="cursor-pointer text-[13px] font-semibold text-blue">See economics and applied rules</summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pb-2 text-[12px] text-ink-2">
              <dt>Pre-GST value</dt>
              <dd className="tabular">{formatINR(x.structure.pricePaise)}</dd>
              <dt>GST</dt>
              <dd className="tabular">{formatINR(sum(x.structure.payments.map((p) => p.gstPaise)))}</dd>
              <dt>Contribution</dt>
              <dd className="tabular">
                {formatINR(e.pricePaise)} − direct costs {formatINR(e.directCostPaise)} − expected payment fees {formatINR(e.expectedFeesPaise)} = {formatINR(e.netContributionPaise)} ({(e.netContributionBps / 100).toFixed(2)}% of price)
              </dd>
              <dt>Contribution floor</dt>
              <dd>{contribution ? explainCheck(contribution) : "—"}</dd>
              <dt>Peak funding requirement</dt>
              <dd className="tabular">
                {formatINR(e.peakFundingPaise)}
                {e.peakFundingDate ? ` on ${formatDate(e.peakFundingDate)}` : ""}
              </dd>
              <dt>Cash-at-risk limit</dt>
              <dd className="tabular">{formatINR(policy.cashAtRiskLimitPaise)}</dd>
              <dt>Assumptions</dt>
              <dd>Costs are committed at the start of each delivery month; payments are collected on their due dates.</dd>
            </dl>
          </details>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 border-t border-line px-5 py-4 md:grid-cols-2">
        <div data-testid="offer-achieves">
          <h3 className="text-[13px] font-semibold text-ink">What this offer achieves</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-ink-2">
            {summary.achieves.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
        <div data-testid="offer-changes">
          <h3 className="text-[13px] font-semibold text-ink">What changes from the original proposal</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-ink-2">
            {summary.changes.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-line bg-surface-muted px-5 py-3 text-[13px]" data-testid="why-offer">
        <span className="font-semibold text-ink">Why this offer: </span>
        <span className="text-ink-2">{aiNote ?? "It fits the buyer's confirmed budget, timing and approval limit, and passes your rules. Options within the approval limit are ranked first."}</span>
        <div className="mt-1 text-[12px] text-muted" data-testid="attribution">
          {explanationAttribution(exp?.source ?? null)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">{primary}</div>
    </article>
  );
}

/** Other eligible options, collapsed and visually secondary (spec §5.1 item 8). */
export function Alternatives({ options, selectedId }: { options: EvaluatedStructure[]; selectedId: string }) {
  const others = options.filter((x) => x.structure.id !== selectedId);
  if (!others.length) return null;
  return (
    <details className="rounded-[var(--radius-card)] border border-line bg-surface" data-testid="compare-alternatives">
      <summary className="cursor-pointer px-5 py-3 text-[14px] font-semibold text-ink">Compare alternatives ({others.length})</summary>
      <ul className="divide-y divide-line border-t border-line">
        {others.map((x, i) => (
          <li key={x.structure.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]" data-testid={`alternative-${i + 1}`}>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-ink">{headlineFor(x)}</div>
              <div className="text-ink-2">{x.structure.label}</div>
              <div className="mt-0.5">
                <ApprovalBadge approval={x.approval} />
              </div>
            </div>
            <div className="tabular text-ink-2">
              {formatINR(sum(x.structure.payments.map((p) => p.totalPaise)))} · projected contribution {formatINR(x.economics.netContributionPaise)}
            </div>
            <ActionButton body={{ action: "select_option", structureId: x.structure.id }} variant="ghost" testId={`select-${i + 1}`}>
              Select this offer
            </ActionButton>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Why other options didn't fit: featured buyer- and seller-side rejections, then the full list. */
export function Rejections({ r }: { r: EnumerationResult }) {
  const featured = featuredRejections(r);
  const pair = [featured.buyer, featured.seller].filter((x): x is EvaluatedStructure => !!x);
  return (
    <details className="rounded-[var(--radius-card)] border border-line bg-surface" data-testid="why-not-others">
      <summary className="cursor-pointer px-5 py-3 text-[14px] font-semibold text-ink">Why other options didn&apos;t fit</summary>
      <div className="space-y-3 border-t border-line px-5 py-4">
        {pair.map((x) => (
          <div key={x.structure.id} className="rounded-xl border border-[#f6cfc9] p-3" data-testid={x === featured.buyer ? "featured-buyer-rejection" : "featured-seller-rejection"}>
            <Badge tone="red">{x === featured.buyer ? "The buyer can't carry it out" : "Fails your rules"}</Badge>
            <div className="mt-1 text-[13px] font-semibold text-ink">{x.structure.label}</div>
            <ul className="mt-1 space-y-0.5 text-[13px] text-red">
              {failingChecks(x).map((c, i) => (
                <li key={i}>
                  ✕ {explainCheck(c)}
                  {c.side === "seller" && RULE_NAME[c.id] ? (
                    <span className="text-ink-2">
                      {" "}
                      · <OpenAudit section="rules">Rule: {RULE_NAME[c.id]}</OpenAudit>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <details className="rounded-xl border border-line px-3 py-2">
          <summary className="cursor-pointer text-[13px] font-semibold text-ink">All {r.rejected.length} rejected and {r.needsInformation.length} needs-information structures</summary>
          <ul className="mt-2 divide-y divide-line text-[13px]">
            {[...r.rejected, ...r.needsInformation].map((x) => (
              <li key={x.structure.id} className="py-1.5" data-testid="rejected-row">
                <span className="font-semibold text-ink">{x.structure.label}</span>
                <span className={x.verdict === "needs_information" ? "text-amber" : "text-red"}>
                  {" · "}
                  {[
                    ...new Set(
                      [...x.buyerChecks, ...x.sellerChecks]
                        .filter((c) => c.status === "fail" || c.status === "needs_information")
                        .map((c) => explainCheck(c)),
                    ),
                  ]
                    .slice(0, 1)
                    .join("")}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </details>
  );
}

export function SuccessMeasure() {
  return (
    <p className="flex items-center gap-1.5 text-[12px] text-muted" data-testid="success-measure">
      Success measure: realised contribution from this deal within 90 days.
      <span title="Projected contribution is a forecast. Realised contribution depends on verified cash, refunds, payment fees and delivery costs." aria-label="About this measure" className="inline-flex">
        <Info aria-hidden className="h-3.5 w-3.5" />
      </span>
    </p>
  );
}
