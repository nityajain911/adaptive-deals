import Link from "next/link";
import type { EvaluatedStructure } from "@/domain/engine";
import { formatDate } from "@/domain/dates";
import type { CanonicalFollowOn, FollowOnOption } from "@/domain/follow-on";
import { formatINR, sum } from "@/domain/money";
import type { ServicePackage } from "@/domain/types";
import { revisionTransformation } from "@/lib/deal-transformation";
import { approxINR } from "@/lib/offer-copy";
import { PrimaryActionButton } from "../client";
import { InfoButton } from "../info-button";
import { ApprovalBadge } from "../structure-card";
import { Badge } from "../ui";
import { DealTransformationCard } from "./deal-transformation";
import { MoneySplit } from "./money-split";

/** One way to answer the buyer, as the offer screen lists it: the held offer as it stands, or a variant that meets their change. */
export interface FollowOnCandidate {
  /** `held`, or the option's own id. */
  id: string;
  title: string;
  held: CanonicalFollowOn;
  evaluated: EvaluatedStructure;
}

export const candidatesOf = (held: CanonicalFollowOn, heldEvaluated: EvaluatedStructure, options: FollowOnOption[]): FollowOnCandidate[] => [
  ...options.map((o) => ({ id: o.id, title: `The rest of the year · ${o.label.charAt(0).toLowerCase()}${o.label.slice(1)}`, held: o.held, evaluated: o.evaluated })),
  { id: "held", title: "The rest of the year · as held", held, evaluated: heldEvaluated },
];

const sideOf = (h: CanonicalFollowOn, e: EvaluatedStructure) => ({ scope: h.scope, totalPaise: h.pricing.totalPaise, startDate: h.startDate, payments: h.instalments, approval: e.approval });

/**
 * The month-three review, on the offer screen: the buyer asked to carry on with a change, so the owner sees the same comparison as for
 * any offer, with what is committed (the held rest of the year) on one side and what would replace it on the other.
 * The best fit is suggested; the others are one step away. Nothing here lets the owner back out: the buyer said they want to carry on.
 */
export function FollowOnOffer({ dealId, request, held, candidates, selectedId, packages }: { dealId: string; request: string; held: CanonicalFollowOn; candidates: FollowOnCandidate[]; selectedId: string; packages: Pick<ServicePackage, "id" | "name">[] }) {
  const heldCandidate = candidates.find((c) => c.id === "held")!;
  const chosen = candidates.find((c) => c.id === selectedId) ?? candidates[0];
  const others = candidates.filter((c) => c.id !== chosen.id).slice(0, 2);
  const transformation = revisionTransformation({ was: sideOf(held, heldCandidate.evaluated), now: sideOf(chosen.held, chosen.evaluated), packages });
  const e = chosen.evaluated.economics;
  const total = chosen.held.pricing.totalPaise;
  const first = chosen.evaluated.structure.payments[0]?.dueDate;
  const body = chosen.id === "held" ? { action: "send_follow_on", conditionMet: true } : { action: "send_follow_on", optionId: chosen.id };
  return (
    <div className="space-y-4" data-testid="follow-on-offer">
    <p className="rounded-xl border border-line bg-surface px-4 py-3 text-[15px] text-ink" data-testid="buyer-request">{request}</p>
    <div className={`grid grid-cols-1 items-start gap-4 ${others.length ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
      <article className="overflow-hidden rounded-[var(--radius-card)] border border-[#c7d3ff] bg-surface shadow-[0_0_0_3px_var(--blue-weak)]" data-testid="recommendation">
        <div className="border-b border-line px-5 py-4">
          <Badge tone="blue">{chosen.id === candidates[0].id ? "Suggested offer" : "You chose this"}</Badge>
          <h2 className="mt-2 text-[22px] font-bold tracking-tight text-ink" data-testid="offer-headline">{chosen.title}</h2>
        </div>
        <DealTransformationCard value={transformation} />
        <div className="space-y-1 border-b border-line px-5 py-3 text-[14px] text-ink-2" data-testid="offer-payments">
          {chosen.held.instalments} payment{chosen.held.instalments === 1 ? "" : "s"} of {formatINR(Math.round(total / chosen.held.instalments))}{first ? ` from ${formatDate(first)}` : ""}
        </div>
        <div className="px-5 py-4">
          <div className="flex items-center gap-1 text-[13px] font-semibold uppercase tracking-wide text-muted">
            You&apos;d keep
            <InfoButton label="About this estimate">After your delivery costs and payment fees. An estimate, not a promise.</InfoButton>
          </div>
          <div className="tabular text-[26px] font-semibold text-ink" data-testid="offer-contribution">{approxINR(e.netContributionPaise)}</div>
          <MoneySplit gstPaise={sum(chosen.evaluated.structure.payments.map((p) => p.gstPaise))} costsPaise={e.directCostPaise} feesPaise={e.expectedFeesPaise} keepPaise={e.netContributionPaise} />
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
          <PrimaryActionButton body={body} onDone={`/deals/${dealId}/track`}>Send to the buyer</PrimaryActionButton>
        </div>
      </article>
      {others.length ? (
        <section className="space-y-3" data-testid="compare-alternatives" aria-labelledby="follow-on-others">
          <h2 id="follow-on-others" className="text-[13px] font-semibold text-ink-2">Other offers</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {others.map((c, i) => (
              <li key={c.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-4 text-[14px]" data-testid={`alternative-${i + 1}`}>
                <div className="font-semibold text-ink">{c.title}</div>
                <div className="mt-0.5 text-ink-2">{formatINR(c.held.pricing.totalPaise)} · {c.held.instalments} payments</div>
                <div className="mt-1"><ApprovalBadge approval={c.evaluated.approval} /></div>
                <div className="mt-1 text-[13px] text-ink-2">You&apos;d keep {approxINR(c.evaluated.economics.netContributionPaise)}</div>
                <div className="mt-2">
                  <Link href={`/deals/${dealId}/offer?option=${encodeURIComponent(c.id)}`} className="text-[14px] font-semibold text-blue hover:underline" data-testid={`select-${i + 1}`}>Use this instead</Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
    </div>
  );
}
