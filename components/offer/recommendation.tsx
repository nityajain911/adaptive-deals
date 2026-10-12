import { explainCheck } from "@/domain/copy";
import { failingCounterChecks } from "@/domain/counter";
import { formatDate } from "@/domain/dates";
import { failingChecks, featuredRejections, type EnumerationResult, type EvaluatedStructure } from "@/domain/engine";
import { formatINR, sum } from "@/domain/money";
import type { MerchantPolicy } from "@/domain/types";
import type { ServicePackage } from "@/domain/types";
import type { DealBaseline } from "@/domain/deal-baseline";
import { alternativeContributionLine, approxINR, counterReason, headlineFor, joinRules } from "@/lib/offer-copy";
import { dealTransformation, type DealTransformation } from "@/lib/deal-transformation";
import { originalProposalOf, packageName } from "@/lib/deal-context-shared";
import type { CounterOffer } from "@/lib/deal-records";
import Link from "next/link";
import type { ReactNode } from "react";
import { ActionButton } from "../client";
import { InfoButton } from "../info-button";
import { MoneySplit } from "./money-split";
import { EditableBreakdown, type EditorAccount, type UnlockStop } from "./deal-editor";
import type { InputOverride } from "@/lib/deal-economics";
import { OfferPaymentSchedule } from "./payment-schedule";
import { DealTransformationCard } from "./deal-transformation";
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
export function Recommendation({ x, policy, baseline, packages, transformation: suppliedTransformation, context, primary, presentation, reason, attribution, evidence = null, economics, counter = null, leaderNote = null, comparison = null, proof = null, editor = null }: {
  x: EvaluatedStructure;
  policy: MerchantPolicy;
  baseline: DealBaseline;
  packages: ServicePackage[];
  transformation?: DealTransformation;
  /** Deprecated presentation input retained for recorded component fixtures. */
  context?: string;
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
  /** The evidence behind the figures, shown inside the closed explanation. */
  proof?: ReactNode;
  /** Changing a number for this deal, in place: what can be changed, what is changed, and what the profit limit would unlock. */
  editor?: { account: EditorAccount; overrides: InputOverride[]; stops: UnlockStop[] } | null;
}) {
  const total = sum(x.structure.payments.map((p) => p.totalPaise));
  void context;
  void evidence;
  const transformation = suppliedTransformation ?? dealTransformation({ baseline, offer: x, packages, originalApprovalLabel: "Original approval not recorded" });
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
      </div>
      <DealTransformationCard value={transformation} />
      <div className="space-y-1 border-b border-line px-5 py-3 text-[14px] text-ink-2">
        <OfferPaymentSchedule payments={x.structure.payments} />
      </div>
      {leaderNote ? <div className="border-b border-line bg-amber-weak/50 px-5 py-3 text-[14px]" data-testid="leader-note">{leaderNote}</div> : null}
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-1 text-[13px] font-semibold uppercase tracking-wide text-muted">
            {e.netContributionPaise < 0 ? "You'd lose" : "You'd keep"}
            <InfoButton label="About this estimate" testId="offer-keeps-info">
              After your delivery costs and payment fees. An estimate, not a promise.
            </InfoButton>
          </div>
          <p className={passesRules ? "text-[13px] font-medium text-green" : "text-[13px] font-medium text-amber"} data-testid="rules-result">
            {passesRules ? "✓ Within your limits" : "Check your limits before sending this."}
          </p>
        </div>
        <div className={`tabular text-[26px] font-semibold ${e.netContributionPaise < 0 ? "text-red" : "text-ink"}`} data-testid="offer-contribution">
          {e.netContributionPaise < 0 ? `a loss of ${approxINR(-e.netContributionPaise)}` : approxINR(e.netContributionPaise)}
        </div>
        {editor ? (
          <EditableBreakdown split={{ gstPaise: sum(x.structure.payments.map((p) => p.gstPaise)), costsPaise: e.directCostPaise, feesPaise: e.expectedFeesPaise, keepPaise: e.netContributionPaise }} account={editor.account} overrides={editor.overrides} stops={editor.stops} limitsLine={null} />
        ) : (
          <MoneySplit gstPaise={sum(x.structure.payments.map((p) => p.gstPaise))} costsPaise={e.directCostPaise} feesPaise={e.expectedFeesPaise} keepPaise={e.netContributionPaise} />
        )}
        <details className="mt-3 rounded-xl border border-line px-4 py-2" data-testid="see-economics">
          <summary className="cursor-pointer text-[13px] font-semibold text-blue">How this was worked out</summary>
          <div className="space-y-3 pb-2 pt-2 text-[13px] text-ink-2" data-testid="why-offer">
            <p><span className="font-semibold text-ink">Why this one: </span>{counter ? counterReason(failingCounterChecks(x).map((c) => explainCheck(c))) : reason}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
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
            {proof}
            <p className="text-[12px] text-muted" data-testid="attribution">{counter ? counterAttribution(counter) : attribution}</p>
          </div>
        </details>
        {counter?.override ? (
          <div className="mt-3 rounded-lg border border-[#f7dfb4] bg-amber-weak px-3 py-2 text-[13px] text-ink-2" data-testid="counter-override-note">
            <span className="font-semibold text-amber">Limits you chose to go past:</span> {joinRules(failingCounterChecks(x).map((c) => explainCheck(c)))}
          </div>
        ) : null}
      </div>
      {comparison ? <div className="border-t border-line px-5 py-4">{comparison}</div> : null}
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

/** At most two other offers, as cards beside the suggested one, so the merchant can swap without reading a list. */
export function Alternatives({ options, selectedId, heading = "Other offers", testId = "compare-alternatives" }: { options: EvaluatedStructure[]; selectedId: string; heading?: string; testId?: string }) {
  const others = options.filter((x) => x.structure.id !== selectedId).slice(0, 2);
  if (!others.length) return null;
  return (
    <section className="space-y-3" data-testid={testId} aria-labelledby={`${testId}-heading`}>
      <h2 id={`${testId}-heading`} className="text-[13px] font-semibold text-ink-2">{heading}</h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {others.map((x, i) => (
          <li key={x.structure.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-4 text-[14px]" data-testid={`alternative-${i + 1}`}>
            <div className="font-semibold text-ink">{headlineFor(x)}</div>
            <div className="mt-0.5 text-ink-2">{formatINR(sum(x.structure.payments.map((p) => p.totalPaise)))} · {x.structure.payments.length === 1 ? "1 payment" : `${x.structure.payments.length} payments`}</div>
            <div className="mt-1">
              <ApprovalBadge approval={x.approval} />
            </div>
            <div className="mt-1 text-[13px] text-ink-2">{alternativeContributionLine(x)}</div>
            <div className="mt-2">
              <ActionButton body={{ action: "select_option", structureId: x.structure.id }} variant="ghost" testId={`select-${i + 1}`}>
                Use this instead
              </ActionButton>
            </div>
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
      <summary className="cursor-pointer px-5 py-3 text-[14px] font-semibold text-ink">Why each was ruled out</summary>
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
    ? "You set this amount. It is outside your limits, and you chose to go ahead anyway."
    : "You set this amount. It is within all your limits.";
}
