import Link from "next/link";
import { ReplySuggestionBlock } from "@/components/track/reply-suggestion";
import { formatDate } from "@/domain/dates";
import { MarkHandledForm, PrimaryActionButton, RevealButton, ReviewWorkForm } from "@/components/client";
import { ConversationThread } from "@/components/conversation-thread";
import { StageShell } from "@/components/deal/stage-shell";
import { fmtTime } from "@/components/evidence";
import { performanceLine, performanceView } from "@/lib/performance-view";
import { AmendmentCard } from "@/components/track/amendment-card";
import { PaymentTimeline } from "@/components/track/payment-timeline";
import type { ChangeRequestDetail } from "@/domain/change-request";
import { NegotiationCorridor } from "@/components/track/negotiation-corridor";
import { CurrentAgreement } from "@/components/track/current-agreement";
import { InfoButton } from "@/components/info-button";
import { Card } from "@/components/ui";
import { loadDeal, stageHref } from "@/lib/deal-page";
import { buyerConditionOf, corridorFor, followOnChangePreview, reviewOf } from "@/lib/service";
import { FollowOnReview } from "@/components/track/follow-on-review";
import { isResolvingDisposition } from "@/lib/deal-records";
import { activeVersionOf, noticeReplyOutcome, replyNeedsExactDate, unresolvedWork } from "@/lib/views";
import { proposalLinkOf } from "@/lib/track-links";
import { contractFinancialView } from "@/lib/financial-view";
import { currentAgreementSummary } from "@/lib/current-agreement";
import { McpCollectionActionCard } from "@/components/mcp/collection-action-card";
import { mcpCollectionView } from "@/lib/mcp-view";
import { paymentTimeline } from "@/lib/payment-timeline";

/** Stage 3 · Track the deal (spec §6). */
/** The amount and GST basis a buyer typed into the price form, as the merchant's amount form starts out. */
function structuredPrice(request: ChangeRequestDetail | undefined): { amountText: string; basis: "including" | "excluding" } | undefined {
  return request?.kind === "price" ? { amountText: String(request.targetPaise / 100), basis: request.gstBasis } : undefined;
}

export default async function TrackPage(props: PageProps<"/deals/[dealId]/track">) {
  const { dealId } = await props.params;
  const { s, out, progress, activeCase, deal, now } = await loadDeal(dealId);
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
  const hasAction = !!primary && ["draft_revised_terms", "review_revised_terms", "review_buyer_message", "review_buyer_request", "review_conflicting_evidence", "review_follow_up", "send_follow_on", "close_follow_on"].includes(primary.id);
  // A sent offer the buyer has not accepted: nothing to do, nothing collected, so the page is only the offer and the way back.
  const quiet = progress.kind === "waiting_on_buyer" && !shown?.buyerAcceptance;
  const buyerVersion = progress.kind === "waiting_on_buyer" && progress.version ? progress.version : (shown?.version ?? 1);

  // Change request or amendment for the active version (stale earlier-version requests excluded).
  const openCr = active ? s.changeRequests.find((c) => (c.state === "change_requested" || c.state === "draft_amendment") && c.agreementVersion === active.version) : undefined;
  const settledCr = active ? [...s.changeRequests].reverse().find((c) => c.state === "payment_rescheduled" && s.amendments.find((a) => a.id === c.amendmentId)?.toVersion === active.version) : undefined;
  const cr = openCr ?? settledCr;
  const amendment = cr?.amendmentId ? (s.amendments.find((a) => a.id === cr.amendmentId) ?? null) : null;

  // Buyer messages awaiting the merchant.
  const handled = new Set(s.handledMessages.map((h) => h.messageId));
  const resolvedWork = new Set(s.workDispositions.filter((d) => d.sourceKind === "message" && isResolvingDisposition(d.kind)).map((d) => d.sourceId));
  const attention = s.conversation.filter((i) => {
    if (i.direction !== "inbound" || handled.has(i.id) || resolvedWork.has(i.id)) return false;
    if (s.conversation.find((x) => x.id === i.inReplyTo)?.kind !== "notice") return false;
    const o = noticeReplyOutcome(i, s, active?.version ?? null);
    return o?.label === "Merchant attention needed" || o?.label === "Payment claimed — verification required";
  });

  // What the buyer said when the pilot ended, and what a change they asked for would come to.
  const review = reviewOf(s);
  const followOnBuyer = review.reply && review.state !== "none" && review.state !== "awaiting" ? { decision: review.state as "proceed" | "stop" | "changes" | "unclear", text: review.reply.text } : null;
  const preview = primary?.id === "send_follow_on" && review.state === "changes" ? await followOnChangePreview(s, deal) : null;
  const followOnChange = preview ? { removedName: preview.removedName, totalPaise: preview.totalPaise, within: preview.approval === "within_limit" } : null;
  const outcomeLine = performanceLine(performanceView({ s, out, deal, now }).summary);
  const financial = shown ? contractFinancialView({ agreement: shown, attempts: s.attempts, eligibleAt: s.eligibleAt, now }) : null;
  const agreementSummary = shown && financial
    ? currentAgreementSummary({
        agreements: s.agreements,
        packages: deal.packages,
        financial,
        progress,
        paymentSetup: {
          upfront: shown.terms.paymentSchedule.some((line) => line.method === "payment_link") ? (s.paymentLinks.some((link) => link.status === "paid") ? "paid" : "pending") : "not_applicable",
          mandate: shown.terms.mandate ? (s.mandate?.status === "confirmed" ? "confirmed" : "pending") : "not_applicable",
        },
      })
    : null;
  const timeline = shown ? paymentTimeline(s, shown.version) : [];
  // A buyer's price request on a proposal they have not accepted gets the negotiation corridor, computed by code.
  const priceRequest = s.status === "sent" ? workItems.find((item) => item.kind === "buyer_request" && item.sourceKind === "message" && !s.amendments.some((a) => a.toVersion === item.version) && s.conversation.find((m) => m.id === item.sourceId)?.refs.topic === "price") : undefined;
  const priceRequestId = priceRequest?.sourceId ?? null;
  const corridor = priceRequest ? await corridorFor({}).catch(() => null) : null;
  const mcpView = await mcpCollectionView();
  // The decision for a price request sits under the buyer's message, in the chat, and is not repeated in the work list.
  const chat = <ConversationThread s={s} scope="track" buyerName={activeCase.buyer.name} compact={4} footer={corridor && priceRequest ? <NegotiationCorridor view={corridor} onDone={stageHref(dealId, "offer")} requestId={priceRequest.sourceId} buyerRequest={priceRequest.text} requested={structuredPrice(s.conversation.find((m) => m.id === priceRequest.sourceId)?.refs.request)} /> : null} />;
  const decisionInChat = !!(corridor && priceRequest);
  const otherWork = decisionInChat ? workItems.filter((item) => item !== priceRequest) : workItems;

  return (
    <StageShell dealId={dealId} viewing="track">
      <div className="space-y-5">
        {decisionInChat ? chat : null}
        <div data-walkthrough="collection-setup">
        <Card className="space-y-3 p-5" data-testid="now-card">
          {quiet ? null : <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">Next step</div>}
          <div className="flex flex-wrap items-center gap-3">
            {primary?.id === "draft_revised_terms" ? <PrimaryActionButton body={{ action: "propose_amendment" }}>{primary.label}</PrimaryActionButton> : null}
            {primary?.id === "send_follow_on" || primary?.id === "close_follow_on" ? <FollowOnReview label={primary.label} condition={buyerConditionOf(out)} buyer={followOnBuyer} change={followOnChange} heldTotalPaise={active?.terms.followOn?.pricing.totalPaise ?? 0} /> : null}
            {primary?.id === "review_revised_terms" ? <RevealButton targetId="amendment-card">{primary.label}</RevealButton> : null}
            {primary?.id === "review_buyer_message" ? <RevealButton targetId="attention-card">{primary.label}</RevealButton> : null}
            {primary && ["review_buyer_request", "review_conflicting_evidence", "review_follow_up"].includes(primary.id) ? <RevealButton targetId={decisionInChat ? "negotiation-corridor" : "buyer-work-card"}>{primary.label}</RevealButton> : null}
            {!hasAction && !quiet ? <p className="text-[15px] text-ink-2" data-testid="no-action">Nothing for you to do right now.</p> : null}
            {shown && progress.kind !== "action_required" && progress.kind !== "terminal" ? (
              // While the buyer is asked to act, link the version they must act on (e.g. the revision).
              <Link href={proposalLinkOf({ agreementId: shown.agreementId, version: buyerVersion })} className="text-[14px] font-semibold text-blue hover:underline" data-testid="open-buyer-proposal">
                See what the buyer sees
              </Link>
            ) : null}
            {latestDelivered && !shown?.buyerAcceptance ? (
              <span className="inline-flex items-center gap-1 text-[13px] font-medium text-green" data-testid="delivery-status">
                <span aria-hidden className="h-2 w-2 rounded-full bg-green" />
                Sent to {activeCase.buyer.name} at {fmtTime(latestDelivered.deliveredAt!)}
                <InfoButton label="About this delivery">
                  Sent {fmtTime(latestDelivered.deliveredAt!)} on WhatsApp (simulated). Version {latestDelivered.version}.
                </InfoButton>
              </span>
            ) : null}
            <Link href="/deals" className={quiet ? "ml-auto inline-flex min-h-10 items-center rounded-lg bg-blue px-4 text-[14px] font-semibold text-white hover:bg-blue-ink" : "ml-auto inline-flex min-h-10 items-center rounded-lg border border-line-strong bg-surface px-4 text-[14px] font-semibold text-ink hover:bg-surface-muted"} data-testid="return-to-deals">
              {quiet ? "Back to active deals" : "Return to deals"}
            </Link>
          </div>
        </Card>
        </div>

        {decisionInChat ? null : chat}

        {otherWork.length ? (
          <details id="buyer-work-card" open={primary ? ["review_buyer_request", "review_conflicting_evidence", "review_follow_up"].includes(primary.id) : false} className="rounded-[var(--radius-card)] border border-[#f7dfb4] bg-surface" data-testid="buyer-work-card">
            <summary className="cursor-pointer px-5 py-3 text-[15px] font-semibold text-ink">The buyer needs an answer ({otherWork.length})</summary>
            <ul className="divide-y divide-line border-t border-line">
              {otherWork.map((item) => (
                <li key={`${item.sourceKind}-${item.sourceId}`} className="px-5 py-4 text-[13px]" data-testid={`work-${item.sourceId}`}>
                  <div className="font-medium text-ink">Buyer: “{item.text}”</div>
                  <div className="mt-1 text-ink-2">{item.detail}</div>
                  {item.kind === "follow_up_pending" ? <div className="mt-1 font-medium text-amber" data-testid={`follow-up-note-${item.sourceId}`}>Follow-up pending since {fmtTime(item.occurredAt)}{item.note ? ` · ${item.note}` : ""}</div> : item.note ? <div className="mt-1 text-ink-2">Your note: {item.note} · {fmtTime(item.occurredAt)}</div> : null}
                  
                  {corridor && item.kind === "buyer_request" && item.sourceKind === "message" && item.sourceId === priceRequestId ? <NegotiationCorridor view={corridor} onDone={stageHref(dealId, "offer")} requestId={item.sourceId} buyerRequest={item.text} requested={structuredPrice(s.conversation.find((m) => m.id === item.sourceId)?.refs.request)} /> : null}
                  {corridor && item.kind === "buyer_request" && item.sourceKind === "message" && item.sourceId === priceRequestId ? null : <ReviewWorkForm sourceKind={item.sourceKind} sourceId={item.sourceId} followingUp={item.kind === "follow_up_pending"} />}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {cr ? <AmendmentCard s={s} cr={cr} a={amendment} open={primary?.id === "review_revised_terms" || primary?.id === "draft_revised_terms"} /> : null}

        {attention.length ? (
          <details id="attention-card" open={primary?.id === "review_buyer_message"} className="rounded-[var(--radius-card)] border border-[#f7dfb4] bg-surface" data-testid="attention-card">
            <summary className="cursor-pointer px-5 py-3 text-[15px] font-semibold text-ink">The buyer wrote to you ({attention.length})</summary>
            <ul className="divide-y divide-line border-t border-line">
              {attention.map((m) => {
                const claimed = m.classification?.kind === "payment_claimed";
                const dateAmbiguity = replyNeedsExactDate(m.classification);
                return (
                  <li key={m.id} className="px-5 py-3 text-[13px]" data-testid={`attention-${m.id}`}>
                    <div className="text-ink">
                      Buyer: <span className="font-medium">“{m.text}”</span> <span className="text-muted">· {fmtTime(m.createdAt)}</span>
                    </div>
                    
                    <div className="mt-1 text-ink-2">
                      {claimed ? "They say they paid, but we haven't received it. Check your payment records before doing anything." : dateAmbiguity ? "Reply to them and ask for one exact date." : "Reply to them and agree what happens next."}
                    </div>
                    
                    {(() => {
                      const sug = (s.replySuggestions ?? []).find((x) => x.messageId === m.id && x.state === "pending");
                      return sug ? <ReplySuggestionBlock messageId={m.id} phrase={sug.phrase} until={formatDate(sug.unavailableUntil)} earliest={formatDate(sug.earliestDebit)} /> : null;
                    })()}
                    <MarkHandledForm messageId={m.id} />
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}


        {agreementSummary ? (
          <details open={!hasAction} className="group" data-testid="track-agreement-details" data-walkthrough="final-terms">
            <summary className="cursor-pointer rounded-xl border border-line bg-surface px-5 py-3 text-[15px] font-semibold text-ink group-open:hidden">Agreed deal</summary>
            <CurrentAgreement summary={agreementSummary} />
          </details>
        ) : null}
        {shown && !quiet && !decisionInChat ? <PaymentTimeline items={timeline} currentSentence={progress.headline} expectation={progress.primaryAction ? `Next: ${progress.primaryAction.label}.` : progress.kind === "waiting_on_buyer" ? "Their response will appear here. Nothing else is needed from you." : "We will keep this timeline updated as the payment state changes."} /> : null}

        {shown?.buyerAcceptance && (mcpView.connection.connected || mcpView.intent || mcpView.receipt) ? <McpCollectionActionCard simulatedCollection={s.paymentLinks.some((link) => link.mode === "simulated")} {...mcpView} /> : null}


        {shown?.buyerAcceptance || progress.kind === "terminal" ? <Link href={`/deals/${dealId}/performance`} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border border-line bg-surface px-5 py-3 text-[15px] hover:border-[#c7d3ff]" data-testid="track-outcome-link">
          <span><span className="font-semibold text-ink">Deal outcome</span> <span className="text-ink-2">· {outcomeLine}</span></span>
          <span className="font-semibold text-blue">See performance →</span>
        </Link> : null}
      </div>
    </StageShell>
  );
}
