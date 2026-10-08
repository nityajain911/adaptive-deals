import { explainCheck } from "@/domain/copy";
import { failingCounterChecks } from "@/domain/counter";
import { formatDate } from "@/domain/dates";
import { failingChecks, featuredRejections, type EnumerationResult, type EvaluatedStructure } from "@/domain/engine";
import { formatINR, sum } from "@/domain/money";
import type { MerchantPolicy } from "@/domain/types";
import type { ServicePackage } from "@/domain/types";
import type { DealBaseline } from "@/domain/deal-baseline";
import { alternativeContributionLine, approxINR, counterReason, headlineFor, joinRules, offerSummary } from "@/lib/offer-copy";
import { originalProposalOf, packageName } from "@/lib/deal-context-shared";
import type { CounterOffer } from "@/lib/deal-records";
import Link from "next/link";
import type { ReactNode } from "react";
import { ActionButton } from "../client";
import { InfoButton } from "../info-button";
import { ApprovalBadge } from "../structure-card";
import { Badge } from "../ui";

/** Context line from the confirmed profile, with the GST basis and approval scope kept. */
export function contextLine(baseline: DealBaseline, budgetPaise: number | null, limitPaise: number | null, perContract: boolean, includesGst = true): string {
  const o = originalProposalOf(baseline);
  const basis = includesGst ? "including GST" : "excluding GST";
  const parts = [`Your quote was ${formatINR(o.totalPaise)} including GST.`];
  if (budgetPaise !== null) parts.push(`They have ${formatINR(budgetPaise)} ${basis} this quarter.`);
  if (limitPaise !== null) parts.push(`Their MD must approve ${perContract ? "anything" : "any single payment"} above ${formatINR(limitPaise)}.`);
  return parts.join(" ");
}

/** The single recommendation (spec §5.1). Rejections and calculations stay collapsed. */
export function Recommendation({ x, policy, baseline, packages, context, primary, presentation, reason, attribution, evidence = null, economics, counter = null, leaderNote = null, comparison = null }: {
  x: EvaluatedStructure;
  policy: MerchantPolicy;
  baseline: DealBaseline;
  packages: ServicePackage[];
  context: string;
  primary: ReactNode;
  presentation: "recommended" | "merchant_selected";
  /** The reason shown for this offer, written by code. */
  reason: string;
  /** Who ranked and who explained, already worded. */
  attribution: string;
  /** The recorded model's order and reason, kept as history. */
  evidence?: { heading: string; order: string | null; reason: string | null } | null;
  /** Which version of the merchant's economics this deal is evaluated under, and how many deal overrides apply. */
  economics: { version: number; overrides: number };
  counter?: CounterOffer | null;
  /** Shown under the header: for example, the best offer the buyer can approve without MD approval. */
  leaderNote?: ReactNode;
  /** Shown in place of a second explanatory panel: what each strategy would recommend. */
  comparison?: ReactNode;
}) {
  const total = sum(x.structure.payments.map((p) => p.totalPaise));
  const summary = offerSummary(x, baseline, packages, policy.gstRateBps);
  const contribution = [...x.sellerChecks].find((c) => c.id === "seller_contribution");
  const funding = [...x.sellerChecks].find((c) => c.id === "seller_cash_at_risk");
  const passesRules = contribution?.status === "pass" && funding?.status === "pass";
  const e = x.economics;
  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] border border-[#c7d3ff] bg-surface shadow-[0_0_0_3px_var(--blue-weak)]" data-testid="recommendation" data-walkthrough="commercial-recommendation">
      <div className="border-b border-line px-5 py-4">
        <Badge tone="blue">{counter ? "Your counter-offer" : presentation === "merchant_selected" ? "You chose this" : "Suggested offer"}</Badge>
        <h2 className="mt-2 text-[22px] font-bold tracking-tight text-ink" data-testid="offer-headline">
          {headlineFor(x)}
        </h2>
        <p className="mt-1 text-[13px] text-ink-2" data-testid="offer-context">
          {context}
        </p>
      </div>
      {leaderNote ? <div className="border-b border-line bg-amber-weak/50 px-5 py-3 text-[14px]" data-testid="leader-note">{leaderNote}</div> : null}
      <div className="grid grid-cols-1 gap-5 px-5 py-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <div className="space-y-3">
          <div>
            <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">What the buyer pays</div>
            <div className="tabular text-[30px] font-bold tracking-tight text-ink" data-testid="offer-total">
              {formatINR(total)} <span className="text-[14px] font-medium text-muted">including GST</span>
            </div>
            <div className="text-[14px] text-ink-2" data-testid="offer-payments">
              {x.structure.payments.length === 1 ? "One payment" : `${x.structure.payments.length} payments`}: {x.structure.payments.map((p) => `${formatINR(p.totalPaise)} on ${formatDate(p.dueDate)}`).join(", ")}
            </div>
            <div className="mt-1" data-testid="offer-approval">
              <ApprovalBadge approval={x.approval} />
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-2">
            <div>
              <dt className="text-[13px] font-semibold uppercase tracking-wide text-muted">Included</dt>
              <dd className="text-ink">{x.structure.scope.map((i) => `${packageName(packages, i.packageId)}${i.months > 1 ? ` (${i.months} months)` : ""}`).join(", ")}</dd>
            </div>
            <div>
              <dt className="text-[13px] font-semibold uppercase tracking-wide text-muted">Not included</dt>
              <dd className="text-ink">{x.structure.excludedPackageIds.length ? x.structure.excludedPackageIds.map((id) => packageName(packages, id)).join(", ") : "Nothing"}</dd>
            </div>
          </dl>
        </div>
        <div className="space-y-2">
          <div className="rounded-xl border border-line px-4 py-3">
            <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">You&apos;d keep</div>
            <div className="tabular text-[24px] font-semibold text-ink" data-testid="offer-contribution">
              {approxINR(e.netContributionPaise)}
            </div>
            <div className="text-[13px] text-muted" data-testid="offer-keeps">After your delivery costs and payment fees. An estimate, not a promise.</div>
          </div>
          <p className={passesRules ? "text-[13px] font-medium text-green" : "text-[13px] font-medium text-amber"} data-testid="rules-result">
            {passesRules ? "✓ Within your limits" : "Check your limits before sending this."}
          </p>
          <details className="rounded-xl border border-line px-4 py-2" data-testid="see-economics">
            <summary className="cursor-pointer text-[13px] font-semibold text-blue">How we worked this out</summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pb-2 text-[13px] text-ink-2">
              <dt>Price before GST</dt>
              <dd className="tabular">{formatINR(x.structure.pricePaise)}</dd>
              <dt>GST</dt>
              <dd className="tabular">{formatINR(sum(x.structure.payments.map((p) => p.gstPaise)))}</dd>
              <dt>What you keep</dt>
              <dd className="tabular">
                {formatINR(e.pricePaise)} − delivery costs {formatINR(e.directCostPaise)} − payment fees {formatINR(e.expectedFeesPaise)} = {formatINR(e.netContributionPaise)} ({Math.round(e.netContributionBps / 100)}% of the price)
              </dd>
              <dt>Your profit limit</dt>
              <dd>{contribution ? explainCheck(contribution) : "—"}</dd>
              <dt>Most you&apos;d spend before being paid</dt>
              <dd className="tabular" data-testid="offer-cash">
                {formatINR(e.peakFundingPaise)}
                {e.peakFundingDate ? ` on ${formatDate(e.peakFundingDate)}` : ""} · your limit is {formatINR(policy.cashAtRiskLimitPaise)}
              </dd>
              <dt>Based on</dt>
              <dd data-testid="offer-rules">
                <Link href="/economics" className="font-medium text-blue hover:underline" data-testid="offer-economics-link">your prices &amp; costs</Link>{economics.overrides ? ` and ${economics.overrides} change${economics.overrides === 1 ? "" : "s"} you made for this deal` : ""}
              </dd>
            </dl>
          </details>
        </div>
      </div>
      {comparison ? <div className="border-t border-line px-5 py-4">{comparison}</div> : null}
      <details className="border-t border-line px-5 py-3" data-testid="offer-details">
        <summary className="cursor-pointer text-[13px] font-semibold text-blue">What changes from your original quote</summary>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div data-testid="offer-achieves">
            <h3 className="text-[13px] font-semibold text-ink">What you get</h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-ink-2">
              {summary.achieves.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
          <div data-testid="offer-changes">
            <h3 className="text-[13px] font-semibold text-ink">What changes</h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-ink-2">
              {summary.changes.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        </div>
      </details>
      <div className="border-t border-line bg-surface-muted px-5 py-3 text-[13px]" data-testid="why-offer">
        <span className="font-semibold text-ink">Why this one: </span>
        <span className="text-ink-2">{counter ? counterReason(failingCounterChecks(x).map((c) => explainCheck(c))) : reason}</span>
        <div className="mt-1 flex flex-wrap items-center gap-1 text-[13px] text-muted">
          <span data-testid="attribution">{counter ? counterAttribution(counter) : attribution}</span>
          {!counter && evidence ? (
            <InfoButton label="Recorded model order and reason" testId="recorded-evidence">
              <span className="block font-semibold text-ink">{evidence.heading}</span>
              {evidence.order ? <span className="mt-1 block">{evidence.order}</span> : null}
              {evidence.reason ? <span className="mt-1 block">Its reason for this offer: {evidence.reason}</span> : null}
            </InfoButton>
          ) : null}
        </div>
        {counter?.override ? (
          <div className="mt-2 rounded-lg border border-[#f7dfb4] bg-amber-weak px-3 py-2 text-[13px] text-ink-2" data-testid="counter-override-note">
            <span className="font-semibold text-amber">Limits you chose to go past:</span> {joinRules(failingCounterChecks(x).map((c) => explainCheck(c)))}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">{primary}</div>
    </article>
  );
}

/** Everything that is not the suggested offer, kept in one closed section so the screen stays about the one decision. */
export function OtherOptions({ children }: { children: ReactNode }) {
  return (
    <details className="rounded-[var(--radius-card)] border border-line bg-surface" data-testid="other-options">
      <summary className="cursor-pointer px-5 py-3 text-[14px] font-semibold text-ink">See other ways to do this deal</summary>
      <div className="space-y-4 border-t border-line px-1 py-3 sm:px-3">{children}</div>
    </details>
  );
}

/** Other eligible options, shown as compact rows so the merchant can see and choose them (not hidden). */
export function Alternatives({ options, selectedId, heading = "Other offers you could send", testId = "compare-alternatives" }: { options: EvaluatedStructure[]; selectedId: string; heading?: string; testId?: string }) {
  const others = options.filter((x) => x.structure.id !== selectedId);
  if (!others.length) return null;
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface" data-testid={testId} aria-labelledby={`${testId}-heading`}>
      <h2 id={`${testId}-heading`} className="px-5 py-3 text-[15px] font-semibold text-ink">
        {heading} ({others.length})
      </h2>
      <ul className="divide-y divide-line border-t border-line">
        {others.map((x, i) => (
          <li key={x.structure.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[14px]" data-testid={`alternative-${i + 1}`}>
            <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
              <div className="font-semibold text-ink">{headlineFor(x)}</div>
              <div className="text-ink-2">{x.structure.label}</div>
              <div className="mt-0.5">
                <ApprovalBadge approval={x.approval} />
              </div>
            </div>
            <div className="tabular text-right text-ink-2">
              <div>{formatINR(sum(x.structure.payments.map((p) => p.totalPaise)))}</div>
              <div className="text-[13px]">{alternativeContributionLine(x)}</div>
            </div>
            <ActionButton body={{ action: "select_option", structureId: x.structure.id }} variant="ghost" testId={`select-${i + 1}`}>
              Select this offer
            </ActionButton>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Why other options didn't fit: featured buyer- and seller-side rejections, then the full list. */
export function Rejections({ r }: { r: EnumerationResult }) {
  const featured = featuredRejections(r);
  const pair = [featured.buyer, featured.seller].filter((x): x is EvaluatedStructure => !!x);
  return (
    <details className="rounded-[var(--radius-card)] border border-line bg-surface" data-testid="why-not-others">
      <summary className="cursor-pointer px-5 py-3 text-[14px] font-semibold text-ink">Offers we ruled out</summary>
      <div className="space-y-3 border-t border-line px-5 py-4">
        {pair.map((x) => (
          <div key={x.structure.id} className="rounded-xl border border-[#f6cfc9] p-3" data-testid={x === featured.buyer ? "featured-buyer-rejection" : "featured-seller-rejection"}>
            <Badge tone="red">{x === featured.buyer ? "Doesn't work for the buyer" : "Outside your limits"}</Badge>
            <div className="mt-1 text-[13px] font-semibold text-ink">{x.structure.label}</div>
            <ul className="mt-1 space-y-0.5 text-[13px] text-red">
              {failingChecks(x).map((c, i) => (
                <li key={i}>
                  ✕ {explainCheck(c)}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <details className="rounded-xl border border-line px-3 py-2">
          <summary className="cursor-pointer text-[13px] font-semibold text-ink">All {r.rejected.length + r.needsInformation.length} offers we ruled out</summary>
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
    <p className="flex items-center gap-1 text-[13px] text-muted" data-testid="success-measure">
      Success measure: realised contribution from this deal within 90 days.
      <InfoButton label="About this measure">Projected contribution is a forecast. Realised contribution depends on verified cash, refunds, payment fees and delivery costs.</InfoButton>
    </p>
  );
}

/** Who set the amount and who checked it, said plainly. */
export function counterAttribution(c: CounterOffer): string {
  return c.override
    ? "You set this amount · the engine rechecked it and found rules not met · you chose to override them · figures calculated by the engine."
    : "You set this amount · the engine rechecked it and every rule passes · figures calculated by the engine.";
}
