import Link from "next/link";
import { computeLedger } from "@/domain/ledger";
import { formatINR } from "@/domain/money";
import { MarkHandledForm, PrimaryActionButton, RevealButton, ReviewWorkForm } from "@/components/client";
import { ConversationThread } from "@/components/conversation-thread";
import { StageShell } from "@/components/deal/stage-shell";
import { fmtTime } from "@/components/evidence";
import { OutcomeCard, type OutcomeSignal } from "@/components/outcome-card";
import { AmendmentCard } from "@/components/track/amendment-card";
import { CurrentAgreement } from "@/components/track/current-agreement";
import { InfoButton } from "@/components/info-button";
import { Card, Stat } from "@/components/ui";
import { heroMerchant, heroPackages } from "@/data/synthetic/hero";
import type { Structure } from "@/domain/structures";
import { loadDeal } from "@/lib/deal-page";
import { BUYER_DECLINE_REASONS, MERCHANT_CLOSE_REASONS, type BuyerDeclineReason, type MerchantCloseReason } from "@/lib/deal-records";
import { outcomeSummary } from "@/lib/outcome";
import { activeVersionOf, noticeReplyOutcome, replyNeedsExactDate, unresolvedWork } from "@/lib/views";
import { proposalLinkOf } from "@/lib/track-links";
import { scheduleRows } from "@/lib/track-copy";
import { contractFinancialView } from "@/lib/financial-view";
import { currentAgreementSummary } from "@/lib/current-agreement";

/** Stage 3 · Track the deal (spec §6). */
export default async function TrackPage(props: PageProps<"/deals/[dealId]/track">) {
  const { dealId } = await props.params;
  const { s, out, progress, activeCase, today, now } = await loadDeal(dealId);
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
  const workItems = unresolvedWork(s);
  const hasAction = !!primary && ["draft_revised_terms", "review_revised_terms", "review_buyer_message", "review_buyer_request", "review_conflicting_evidence", "review_follow_up"].includes(primary.id);
  const buyerVersion = progress.kind === "waiting_on_buyer" && progress.version ? progress.version : (shown?.version ?? 1);

  // Change request or amendment for the active version (stale earlier-version requests excluded).
  const openCr = active ? s.changeRequests.find((c) => (c.state === "change_requested" || c.state === "draft_amendment") && c.agreementVersion === active.version) : undefined;
  const settledCr = active ? [...s.changeRequests].reverse().find((c) => c.state === "payment_rescheduled" && s.amendments.find((a) => a.id === c.amendmentId)?.toVersion === active.version) : undefined;
  const cr = openCr ?? settledCr;
  const amendment = cr?.amendmentId ? (s.amendments.find((a) => a.id === cr.amendmentId) ?? null) : null;

  // Buyer messages awaiting the merchant.
  const handled = new Set(s.handledMessages.map((h) => h.messageId));
  const resolvedWork = new Set(s.workDispositions.filter((d) => d.sourceKind === "message" && (d.kind === "keep_current_terms" || d.kind === "handled_outside")).map((d) => d.sourceId));
  const attention = s.conversation.filter((i) => {
    if (i.direction !== "inbound" || handled.has(i.id) || resolvedWork.has(i.id)) return false;
    if (s.conversation.find((x) => x.id === i.inReplyTo)?.kind !== "notice") return false;
    const o = noticeReplyOutcome(i, s, active?.version ?? null);
    return o?.label === "Merchant attention needed" || o?.label === "Payment claimed — verification required";
  });

  let ledger = null as ReturnType<typeof computeLedger> | null;
  let shownStructure: Structure | null = null;
  if (shown) {
    const x = s.amendments.find((a) => a.toVersion === shown.version)?.revised ?? out.evaluation.result?.structures.find((e) => e.structure.id === shown.structureId);
    if (x) {
      shownStructure = x.structure;
      ledger = computeLedger({ structure: x.structure, attempts: s.attempts, asOf: today, timeZone: heroMerchant.timeZone });
    }
  }

  const summary = outcomeSummary({
    s,
    acceptedStructure: shown?.buyerAcceptance ? shownStructure : null,
    policy: heroMerchant.policy,
    now,
    timeZone: heroMerchant.timeZone,
  });
  const financial = shown ? contractFinancialView({ agreement: shown, attempts: s.attempts, eligibleAt: s.eligibleAt, now }) : null;
  const agreementSummary = shown && financial
    ? currentAgreementSummary({
        agreements: s.agreements,
        packages: heroPackages,
        financial,
        progress,
        paymentSetup: {
          upfront: shown.terms.paymentSchedule.some((line) => line.method === "payment_link") ? (s.paymentLinks.some((link) => link.status === "paid") ? "paid" : "pending") : "not_applicable",
          mandate: shown.terms.mandate ? (s.mandate?.status === "confirmed" ? "confirmed" : "pending") : "not_applicable",
        },
      })
    : null;
  const outcomeSignals: OutcomeSignal[] = s.outcomes.map((o) => {
    let label: string;
    if (o.type === "buyer_accepted") label = `Buyer accepted version ${o.version}`;
    else if (o.type === "buyer_requested_change") label = `Buyer requested a change to version ${o.version}`;
    else if (o.type === "buyer_declined") label = `Buyer declined${o.reasonCode ? ` · ${BUYER_DECLINE_REASONS[o.reasonCode as BuyerDeclineReason]}` : ""}`;
    else if (o.type === "merchant_closed") label = `Merchant closed the deal${o.reasonCode ? ` · ${MERCHANT_CLOSE_REASONS[o.reasonCode as MerchantCloseReason]}` : ""}`;
    else label = "Merchant selected an alternative offer";
    return { id: o.id, label, at: o.at };
  });
  for (const e of s.events.filter((x) => ["payment_succeeded", "debit_failed", "payment_rescheduled"].includes(x.kind))) {
    outcomeSignals.push({ id: e.id, label: e.title, at: e.at });
  }
  outcomeSignals.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return (
    <StageShell dealId={dealId} viewing="track">
      <div className="space-y-5">
        <div data-walkthrough="collection-setup">
        <Card className="space-y-3 p-5" data-testid="now-card">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Your next step</div>
          <div className="flex flex-wrap items-center gap-3">
            {primary?.id === "draft_revised_terms" ? <PrimaryActionButton body={{ action: "propose_amendment" }}>{primary.label}</PrimaryActionButton> : null}
            {primary?.id === "review_revised_terms" ? <RevealButton targetId="amendment-card">{primary.label}</RevealButton> : null}
            {primary?.id === "review_buyer_message" ? <RevealButton targetId="attention-card">{primary.label}</RevealButton> : null}
            {primary && ["review_buyer_request", "review_conflicting_evidence", "review_follow_up"].includes(primary.id) ? <RevealButton targetId="buyer-work-card">{primary.label}</RevealButton> : null}
            {!hasAction ? <p className="text-[15px] text-ink-2" data-testid="no-action">Nothing for you to do right now.</p> : null}
            {shown && progress.kind !== "action_required" && progress.kind !== "terminal" ? (
              // While the buyer is asked to act, link the version they must act on (e.g. the revision).
              <Link href={proposalLinkOf({ agreementId: shown.agreementId, version: buyerVersion })} className="text-[14px] font-semibold text-blue hover:underline" data-testid="open-buyer-proposal">
                Open buyer proposal (version {buyerVersion})
              </Link>
            ) : null}
            {latestDelivered ? (
              <span className="inline-flex items-center gap-1 text-[13px] text-muted" data-testid="delivery-status">
                Offer version {latestDelivered.version} delivered
                <InfoButton label="About this delivery">
                  Delivered {fmtTime(latestDelivered.deliveredAt!)} · simulated channel · link {proposalLinkOf({ agreementId: shown?.agreementId ?? "agr-hero", version: latestDelivered.version })}
                </InfoButton>
              </span>
            ) : null}
          </div>
        </Card>
        </div>

        {agreementSummary ? (
          <details open={!hasAction} className="group" data-testid="track-agreement-details" data-walkthrough="final-terms">
            <summary className="cursor-pointer rounded-xl border border-line bg-surface px-5 py-3 text-[15px] font-semibold text-ink group-open:hidden">Current agreement · version {agreementSummary.version}</summary>
            <CurrentAgreement summary={agreementSummary} />
          </details>
        ) : null}

        {workItems.length ? (
          <details id="buyer-work-card" open={primary ? ["review_buyer_request", "review_conflicting_evidence", "review_follow_up"].includes(primary.id) : false} className="rounded-[var(--radius-card)] border border-[#f7dfb4] bg-surface" data-testid="buyer-work-card">
            <summary className="cursor-pointer px-5 py-3 text-[15px] font-semibold text-ink">Buyer work needing a decision ({workItems.length})</summary>
            <ul className="divide-y divide-line border-t border-line">
              {workItems.map((item) => (
                <li key={`${item.sourceKind}-${item.sourceId}`} className="px-5 py-4 text-[13px]" data-testid={`work-${item.sourceId}`}>
                  <div className="font-medium text-ink">Buyer: “{item.text}”</div>
                  <div className="mt-1 text-ink-2">{item.detail}</div>
                  {item.note ? <div className="mt-1 text-ink-2">Follow-up note: {item.note} · {fmtTime(item.occurredAt)}</div> : null}
                  <div className="mt-1 text-ink-2">Safe next step: {item.dateAmbiguity ? "Ask the buyer for one exact date." : "Review the buyer's request and agree the next step."}</div>
                  <p className="mt-1 text-[12px] text-muted">These choices record your decision only. Terms, payments and the ledger stay unchanged.</p>
                  <ReviewWorkForm sourceKind={item.sourceKind} sourceId={item.sourceId} />
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {cr ? <AmendmentCard s={s} cr={cr} a={amendment} open={primary?.id === "review_revised_terms" || primary?.id === "draft_revised_terms"} /> : null}

        {attention.length ? (
          <details id="attention-card" open={primary?.id === "review_buyer_message"} className="rounded-[var(--radius-card)] border border-[#f7dfb4] bg-surface" data-testid="attention-card">
            <summary className="cursor-pointer px-5 py-3 text-[15px] font-semibold text-ink">Buyer message{attention.length === 1 ? "" : "s"} needing your reply ({attention.length})</summary>
            <ul className="divide-y divide-line border-t border-line">
              {attention.map((m) => {
                const o = noticeReplyOutcome(m, s, active?.version ?? null)!;
                const claimed = m.classification?.kind === "payment_claimed";
                const dateAmbiguity = replyNeedsExactDate(m.classification);
                return (
                  <li key={m.id} className="px-5 py-3 text-[13px]" data-testid={`attention-${m.id}`}>
                    <div className="text-ink">
                      Buyer: <span className="font-medium">“{m.text}”</span> <span className="text-muted">· {fmtTime(m.createdAt)}</span>
                    </div>
                    <div className="mt-1 text-ink-2">Why nothing changed: {o.detail}</div>
                    <div className="mt-1 text-ink-2">
                      Safe next step: {claimed ? "Payment is not confirmed. Verify it against the payment record before taking action." : dateAmbiguity ? "Reply to the buyer personally and ask for one exact date." : "Reply to the buyer personally and agree the next step."}
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
            {ledger && financial?.state === "accepted" ? (
              <details className="mt-3 rounded-xl border border-line px-4 py-2">
                <summary className="cursor-pointer text-[13px] font-semibold text-blue">Payment details</summary>
                <div className="grid grid-cols-2 gap-2 py-2 md:grid-cols-5">
                  <Stat label="Amount still to collect before GST" value={formatINR(ledger.balance.prePaise)} />
                  <Stat label="GST to collect" value={formatINR(ledger.balance.gstPaise)} />
                  <Stat label="Collected (verified)" value={formatINR(ledger.collected.totalPaise)} hint={`${formatINR(ledger.collected.prePaise)} excl. GST`} />
                  <Stat label="Unpaid service value" value={formatINR(ledger.unpaidServiceValuePaise)} />
                  <Stat label="Funding requirement" value={formatINR(ledger.fundingRequirementPaise)} />
                </div>
              </details>
            ) : null}
          </Card>
        ) : null}

        <details className="rounded-[var(--radius-card)] border border-line bg-surface" data-testid="track-outcome-details">
          <summary className="cursor-pointer px-5 py-3 text-[15px] font-semibold text-ink">Outcome and learning</summary>
          <OutcomeCard summary={summary} signals={outcomeSignals} />
        </details>

        <details className="rounded-[var(--radius-card)] border border-line bg-surface" data-testid="track-conversation-details">
          <summary className="cursor-pointer px-5 py-3 text-[15px] font-semibold text-ink">Conversation since the offer</summary>
          <ConversationThread s={s} scope="track" buyerName={activeCase.buyer.name} />
        </details>
      </div>
    </StageShell>
  );
}
