import Link from "next/link";
import type { AgreementVersion } from "@/domain/agreement";
import type { Amendment } from "@/domain/amendment";
import { formatDate } from "@/domain/dates";
import { formatINR } from "@/domain/money";
import type { ChangeRequest } from "@/domain/restructure";
import type { DemoState } from "@/lib/service";
import { proposalLinkOf } from "@/lib/track-links";
import { collectionTruth } from "@/lib/track-copy";
import { ActionButton } from "../client";
import { Checks } from "../structure-card";
import { Badge } from "../ui";

/**
 * Buyer-requested payment change (spec §6.1). Shows what changes and what stays the same before the
 * merchant approves; the collection truth comes from the recorded attempts.
 */
export function AmendmentCard({ s, cr, a, open }: { s: DemoState; cr: ChangeRequest; a: Amendment | null; open: boolean }) {
  const reply = s.conversation.find((i) => i.id === cr.replyId);
  const toV: AgreementVersion | undefined = a ? s.agreements.find((v) => v.version === a.toVersion) : undefined;
  const line = a ? a.revised.structure.payments.find((p) => p.id === a.change.lineId) : null;
  const done = cr.state === "payment_rescheduled" && a?.state === "active";
  if (done && a && line) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[#c9eedd] bg-green-weak px-5 py-3 text-[14px]" data-testid="amendment-settled">
        <span className="font-semibold text-green">Payment rescheduled to {formatDate(a.change.toDueDate)}</span>
        <span className="text-ink-2"> · agreement version {a.toVersion}. Version {a.fromVersion} is kept as superseded history.</span>
      </div>
    );
  }
  return (
    <details id="amendment-card" open={open} className="rounded-[var(--radius-card)] border border-line bg-surface" data-testid="amendment-card">
      <summary className="cursor-pointer px-5 py-3 text-[15px] font-semibold text-ink">Buyer asked to move a payment</summary>
      <div className="space-y-4 border-t border-line px-5 py-4">
        <div className="text-[13px]">
          <div className="text-ink">
            Buyer: <span className="font-medium">“{reply?.text}”</span>
          </div>
          <div className="mt-1 text-muted" data-testid="code-reading">
            Read by code, not AI: “{cr.phrase}” → unavailable through {formatDate(cr.unavailableUntil)} → earliest debit {formatDate(cr.earliestDebit)}
          </div>
        </div>
        {a && line ? (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-[#d6defe] bg-blue-weak p-3 text-[13px]" data-testid="what-changes">
                <div className="font-semibold text-ink">What changes</div>
                <p className="mt-1 text-ink-2">
                  The {formatINR(line.totalPaise)} payment moves from {formatDate(a.change.fromDueDate)} to {formatDate(a.change.toDueDate)}.
                </p>
              </div>
              <div className="rounded-xl border border-line p-3 text-[13px]" data-testid="what-stays">
                <div className="font-semibold text-ink">What stays the same</div>
                <ul className="mt-1 list-disc pl-5 text-ink-2">
                  <li>The amount ({formatINR(line.totalPaise)}) and the scope</li>
                  <li>The total ({formatINR(a.revised.structure.payments.reduce((t, p) => t + p.totalPaise, 0))} including GST)</li>
                  <li>Every other payment date</li>
                  <li>{a.mandateFit.fits ? "The existing mandate (the new date fits it)" : "Not the mandate: a fresh authorisation is required"}</li>
                </ul>
              </div>
            </div>
            <p className="text-[13px] font-medium text-green">Rechecked: {a.revised.verdict === "feasible" ? "passes the buyer's limits and your rules." : "does not pass every check."}</p>
            <details className="rounded-xl border border-line px-4 py-2">
              <summary className="cursor-pointer text-[13px] font-semibold text-blue">See rechecks</summary>
              <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2">
                <Checks title="Buyer checks" checks={a.revised.buyerChecks} />
                <Checks title="Seller checks" checks={a.revised.sellerChecks} />
              </div>
              <p className="pb-2 text-[12px] text-muted">
                Projected contribution {formatINR(a.revised.economics.netContributionPaise)} · peak funding requirement {formatINR(a.revised.economics.peakFundingPaise)} · amendment summary written by code from verified state.
              </p>
            </details>
            <ul className="space-y-0.5 rounded-xl bg-surface-muted px-4 py-3 text-[13px] text-ink-2" data-testid="collection-truth">
              {collectionTruth(s, a).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {a.state === "proposed" && toV ? (
              <ActionButton body={{ action: "approve_amendment", termsHash: toV.termsHash }} variant="primary" testId="approve-revised-terms">
                Approve revised terms
              </ActionButton>
            ) : null}
            {a.state === "merchant_approved" && toV ? (
              <Badge tone="blue">
                Waiting for the buyer ·{" "}
                <Link href={proposalLinkOf(toV)} className="underline">
                  open revised proposal
                </Link>
              </Badge>
            ) : null}
          </>
        ) : (
          <p className="text-[13px] text-ink-2">No revised payment date becomes active until both you and the buyer approve.</p>
        )}
      </div>
    </details>
  );
}
