import Link from "next/link";
import { computeLedger } from "@/domain/ledger";
import { formatINR } from "@/domain/money";
import { MarkHandledForm, PrimaryActionButton, RevealButton } from "@/components/client";
import { ConversationThread } from "@/components/conversation-thread";
import { StageShell } from "@/components/deal/stage-shell";
import { fmtTime } from "@/components/evidence";
import { AmendmentCard } from "@/components/track/amendment-card";
import { Card, Stat } from "@/components/ui";
import { heroMerchant } from "@/data/synthetic/hero";
import { loadDeal } from "@/lib/deal-page";
import { activeVersionOf, noticeReplyOutcome } from "@/lib/views";
import { proposalLinkOf } from "@/lib/track-links";
import { scheduleRows } from "@/lib/track-copy";

/** Stage 3 · Track the deal (spec §6). */
export default async function TrackPage(props: PageProps<"/deals/[dealId]/track">) {
  const { dealId } = await props.params;
  const { s, out, progress, today } = await loadDeal(dealId);
  if (progress.stages.track === "upcoming") {
    return (
      <StageShell dealId={dealId} viewing="track">
        <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-[14px] text-muted" data-testid="stage-upcoming">
          Available after you send an offer.
        </p>
      </StageShell>
    );
  }

  const active = activeVersionOf(s.agreements);
  const delivered = s.deliveries.filter((d) => d.deliveredAt);
  const latestDelivered = delivered.at(-1);
  const shown = s.agreements.find((v) => v.version === (active?.version ?? latestDelivered?.version));
  const primary = progress.primaryAction;

  // Change request or amendment for the active version (stale earlier-version requests excluded).
  const openCr = active ? s.changeRequests.find((c) => (c.state === "change_requested" || c.state === "draft_amendment") && c.agreementVersion === active.version) : undefined;
  const settledCr = active ? [...s.changeRequests].reverse().find((c) => c.state === "payment_rescheduled" && s.amendments.find((a) => a.id === c.amendmentId)?.toVersion === active.version) : undefined;
  const cr = openCr ?? settledCr;
  const amendment = cr?.amendmentId ? (s.amendments.find((a) => a.id === cr.amendmentId) ?? null) : null;

  // Buyer messages awaiting the merchant.
  const handled = new Set(s.handledMessages.map((h) => h.messageId));
  const attention = s.conversation.filter((i) => {
    if (i.direction !== "inbound" || handled.has(i.id)) return false;
    if (s.conversation.find((x) => x.id === i.inReplyTo)?.kind !== "notice") return false;
    const o = noticeReplyOutcome(i, s, active?.version ?? null);
    return o?.label === "Merchant attention needed" || o?.label === "Payment claimed — verification required";
  });

  let ledger = null as ReturnType<typeof computeLedger> | null;
  if (shown) {
    const x = s.amendments.find((a) => a.toVersion === shown.version)?.revised ?? out.evaluation.result?.structures.find((e) => e.structure.id === shown.structureId);
    if (x) ledger = computeLedger({ structure: x.structure, attempts: s.attempts, asOf: today, timeZone: heroMerchant.timeZone });
  }

  return (
    <StageShell dealId={dealId} viewing="track">
      <div className="space-y-5">
        <Card className="space-y-3 p-5" data-testid="now-card">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Now</div>
          <div className="text-[18px] font-semibold text-ink">{progress.headline}</div>
          <div className="flex flex-wrap items-center gap-3">
            {primary?.id === "draft_revised_terms" ? <PrimaryActionButton body={{ action: "propose_amendment" }}>{primary.label}</PrimaryActionButton> : null}
            {primary?.id === "review_revised_terms" ? <RevealButton targetId="amendment-card">{primary.label}</RevealButton> : null}
            {primary?.id === "review_buyer_message" ? <RevealButton targetId="attention-card">{primary.label}</RevealButton> : null}
            {shown && progress.kind !== "action_required" && progress.kind !== "terminal" ? (
              <Link href={proposalLinkOf(shown)} className="text-[13px] font-semibold text-blue hover:underline" data-testid="open-buyer-proposal">
                Open buyer proposal (version {shown.version})
              </Link>
            ) : null}
          </div>
          {latestDelivered ? (
            <p className="text-[12px] text-muted" data-testid="delivery-status">
              Offer version {latestDelivered.version} delivered · {fmtTime(latestDelivered.deliveredAt!)} · simulated channel · link {proposalLinkOf({ agreementId: shown?.agreementId ?? "agr-hero", version: latestDelivered.version })}
            </p>
          ) : null}
        </Card>

        {cr ? <AmendmentCard s={s} cr={cr} a={amendment} open={primary?.id === "review_revised_terms" || primary?.id === "draft_revised_terms"} /> : null}

        {attention.length ? (
          <details id="attention-card" open={primary?.id === "review_buyer_message"} className="rounded-[var(--radius-card)] border border-[#f7dfb4] bg-surface" data-testid="attention-card">
            <summary className="cursor-pointer px-5 py-3 text-[15px] font-semibold text-ink">Buyer message{attention.length === 1 ? "" : "s"} needing your reply ({attention.length})</summary>
            <ul className="divide-y divide-line border-t border-line">
              {attention.map((m) => {
                const o = noticeReplyOutcome(m, s, active?.version ?? null)!;
                const claimed = m.classification?.kind === "payment_claimed";
                return (
                  <li key={m.id} className="px-5 py-3 text-[13px]" data-testid={`attention-${m.id}`}>
                    <div className="text-ink">
                      Buyer: <span className="font-medium">“{m.text}”</span> <span className="text-muted">· {fmtTime(m.createdAt)}</span>
                    </div>
                    <div className="mt-1 text-ink-2">Why nothing changed: {o.detail}</div>
                    <div className="mt-1 text-ink-2">
                      Safe next step: {claimed ? "Payment is not confirmed. Verify it against the payment record before taking action." : "Reply to the buyer personally and ask for one exact date."}
                    </div>
                    <p className="mt-1 text-[12px] text-muted">Marking it handled records only that you dealt with it outside the prototype. No reply is sent and no payment changes.</p>
                    <MarkHandledForm messageId={m.id} />
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}

        {shown ? (
          <Card className="p-5" data-testid="payment-schedule">
            <h2 className="text-[15px] font-semibold text-ink">Payment schedule · version {shown.version}</h2>
            <ul className="mt-2 divide-y divide-line">
              {scheduleRows(s, shown.version).map((r) => (
                <li key={r.lineId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[14px]" data-testid={`schedule-${r.lineId}`}>
                  <span className="text-ink">
                    {r.date}
                    {r.was ? <span className="text-muted"> (was {r.was})</span> : null}
                    <span className="ml-2 text-[12px] text-muted">{r.method}</span>
                  </span>
                  <span className="tabular text-ink">
                    {formatINR(r.amountPaise)} <span className="ml-2 text-[12px] font-medium text-ink-2">{r.status}</span>
                  </span>
                </li>
              ))}
            </ul>
            {ledger ? (
              <details className="mt-3 rounded-xl border border-line px-4 py-2">
                <summary className="cursor-pointer text-[13px] font-semibold text-blue">Payment details</summary>
                <div className="grid grid-cols-2 gap-2 py-2 md:grid-cols-5">
                  <Stat label="Balance excl. GST" value={formatINR(ledger.balance.prePaise)} />
                  <Stat label="GST to collect" value={formatINR(ledger.balance.gstPaise)} />
                  <Stat label="Collected (verified)" value={formatINR(ledger.collected.totalPaise)} hint={`${formatINR(ledger.collected.prePaise)} excl. GST`} />
                  <Stat label="Unpaid service value" value={formatINR(ledger.unpaidServiceValuePaise)} />
                  <Stat label="Funding requirement" value={formatINR(ledger.fundingRequirementPaise)} />
                </div>
              </details>
            ) : null}
          </Card>
        ) : null}

        <ConversationThread s={s} scope="track" />
      </div>
    </StageShell>
  );
}
