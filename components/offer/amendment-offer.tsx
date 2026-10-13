import type { AgreementVersion } from "@/domain/agreement";
import type { Amendment } from "@/domain/amendment";
import { formatDate } from "@/domain/dates";
import { formatINR, sum } from "@/domain/money";
import type { ChangeRequest } from "@/domain/restructure";
import type { ServicePackage } from "@/domain/types";
import { revisionTransformation, sideOfVersion } from "@/lib/deal-transformation";
import { approxINR } from "@/lib/offer-copy";
import { PrimaryActionButton } from "../client";
import { InfoButton } from "../info-button";
import { Badge } from "../ui";
import { DealTransformationCard } from "./deal-transformation";
import { MoneySplit } from "./money-split";

/**
 * A buyer who has already accepted asks to move a payment. The owner reviews it on the offer screen like any other change: what is
 * committed on one side, what the revised terms make of it on the other, and one action to approve them.
 */
export function AmendmentOffer({ dealId, request, change, amendment, from, to, packages }: { dealId: string; request: string; change: ChangeRequest; amendment: Amendment; from: AgreementVersion; to: AgreementVersion; packages: Pick<ServicePackage, "id" | "name">[] }) {
  const transformation = revisionTransformation({ was: sideOfVersion(from), now: sideOfVersion(to), packages });
  const e = amendment.revised.economics;
  const line = to.terms.paymentSchedule.find((p) => p.id === amendment.change.lineId);
  const passes = amendment.revised.verdict === "feasible";
  return (
    <div className="space-y-4" data-testid="amendment-offer">
      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-[15px] text-ink" data-testid="buyer-request">The buyer asked: “{request}”</p>
      <p className="px-1 text-[13px] text-muted" data-testid="code-reading">They said “{change.phrase}”, so the earliest they can pay is {formatDate(change.earliestDebit)}.</p>
      <article className="overflow-hidden rounded-[var(--radius-card)] border border-[#c7d3ff] bg-surface shadow-[0_0_0_3px_var(--blue-weak)]" data-testid="recommendation">
        <div className="border-b border-line px-5 py-4">
          <Badge tone="blue">Revised terms</Badge>
          <h2 className="mt-2 text-[22px] font-bold tracking-tight text-ink" data-testid="offer-headline">
            {line ? `Move payment ${line.seq} to ${formatDate(amendment.change.toDueDate)}` : "Move the payment"}
          </h2>
        </div>
        <DealTransformationCard value={transformation} />
        <div className="space-y-1 border-b border-line px-5 py-3 text-[14px] text-ink-2" data-testid="offer-payments">
          {to.terms.paymentSchedule.length} payments: {to.terms.paymentSchedule.map((p) => `${formatINR(p.totalPaise)} on ${formatDate(p.dueDate.value)}`).join(", ")}
        </div>
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex items-center gap-1 text-[13px] font-semibold uppercase tracking-wide text-muted">
              You&apos;d still keep
              <InfoButton label="About this estimate">After your delivery costs and payment fees. An estimate, not a promise.</InfoButton>
            </div>
            <p className={passes ? "text-[13px] font-medium text-green" : "text-[13px] font-medium text-amber"} data-testid="rules-result">
              {passes ? "✓ Works for them and stays within your limits" : "This does not pass every check."}
            </p>
          </div>
          <div className="tabular text-[26px] font-semibold text-ink" data-testid="offer-contribution">{approxINR(e.netContributionPaise)}</div>
          <MoneySplit gstPaise={sum(amendment.revised.structure.payments.map((p) => p.gstPaise))} costsPaise={e.directCostPaise} feesPaise={e.expectedFeesPaise} keepPaise={e.netContributionPaise} />
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
          <PrimaryActionButton body={{ action: "approve_amendment", termsHash: to.termsHash }} onDone={`/deals/${dealId}/track`}>Approve the new terms</PrimaryActionButton>
          <span className="text-[13px] text-muted">Nothing changes until the buyer accepts the revised terms.</span>
        </div>
      </article>
    </div>
  );
}
