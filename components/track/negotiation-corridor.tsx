"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, useAction } from "../client";
import { CounterForm } from "./counter-form";
import { formatINR } from "@/domain/money";
import { negotiationView } from "@/lib/negotiation-view";
import type { CorridorOffer, CorridorView } from "@/lib/service";

function OfferThis({ offer, onDone }: { offer: CorridorOffer; onDone: string }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  return <div className="shrink-0"><Button disabled={pending} data-testid={`offer-this-${offer.structureId}`} onClick={() => run({ action: "answer_with_offer", structureId: offer.structureId }, () => router.push(onDone))}>{pending ? "Preparing…" : "Choose this offer"}</Button><ErrorText error={error} /></div>;
}

function DecisionAction({ body, children, testId, onDone }: { body: Record<string, unknown> & { action: string }; children: ReactNode; testId: string; onDone?: () => void }) {
  const { run, pending, error } = useAction();
  return <div><Button className="w-full sm:w-auto" disabled={pending} data-testid={testId} onClick={() => run(body, onDone)}>{pending ? "Saving…" : children}</Button><ErrorText error={error} /></div>;
}

function CorridorAnchors({ view, buyerRequest, askedPaise }: { view: CorridorView; buyerRequest: string; askedPaise: number | null }) {
  const decision = negotiationView({ corridor: view, buyerRequest, step: "choose" });
  const requested = decision.anchors.buyerAskedPaise ?? askedPaise;
  return <div className="space-y-2" data-testid="corridor-anchors">
    <div className="relative hidden h-2 rounded-full bg-line sm:block" aria-hidden><span className="absolute inset-y-0 left-0 w-full rounded-full bg-blue/15" /></div>
    <dl className="grid gap-2 sm:grid-cols-3">
      <div className="rounded-lg border border-line bg-surface px-3 py-2"><dt className="text-[12px] font-medium text-muted">Buyer asked</dt><dd className="mt-0.5 text-[14px] font-semibold text-ink">{requested === null ? "No exact total stated" : formatINR(requested)}</dd></div>
      <div className="rounded-lg border border-green/30 bg-green-weak px-3 py-2"><dt className="text-[12px] font-medium text-muted">Lowest within your rules</dt><dd className="mt-0.5 text-[14px] font-semibold text-ink">{decision.anchors.safeMinimumPaise === null ? "No verified lower total" : formatINR(decision.anchors.safeMinimumPaise)}</dd></div>
      <div className="rounded-lg border border-line bg-surface px-3 py-2"><dt className="text-[12px] font-medium text-muted">Current offer</dt><dd className="mt-0.5 text-[14px] font-semibold text-ink">{formatINR(decision.anchors.currentOfferPaise)}</dd></div>
    </dl>
  </div>;
}

/** The merchant-only path for a buyer's price request. No commercial rule is changed here. */
export function NegotiationCorridor({ view, onDone, requestId, buyerRequest, requested }: { view: CorridorView; onDone: string; requestId: string; buyerRequest: string; requested?: { amountText: string; basis: "including" | "excluding" } }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [step, setStep] = useState<"choose" | "check">("choose");
  const [leftOpen, setLeftOpen] = useState(false);
  const safeMinimum = view.lowestCompliantPaise;
  const discountRows = view.ladder;
  // A "suggested" counter-offer must actually be lower than what the buyer already has.
  const suggested = safeMinimum !== null && safeMinimum < view.currentTotalPaise ? safeMinimum : null;
  const askedPaise = view.requestedTotalPaise ?? (requested ? Math.round(Number(requested.amountText) * 100) : null);
  const noLowerMessage = view.lowestUnavailable === "evaluation_limit"
    ? "We could not verify a lower total. Check an amount instead."
    : safeMinimum === null
      ? "No lower total is within your rules right now."
      : `Nothing lower than ${formatINR(view.currentTotalPaise)} is within your rules${askedPaise && requested?.basis !== "excluding" ? `, so ${formatINR(askedPaise)} cannot be offered` : ""}. The lowest is ${formatINR(safeMinimum)}.`;
  const offerSafeMinimum = () => {
    if (suggested === null) return;
    run({ action: "counter_offer", totalPaise: suggested, overrideConfirmed: false, acknowledgedChecks: [], reason: "" }, () => router.push(onDone));
  };
  return (
    <section className="mt-3 space-y-4 rounded-xl border border-[#d6defe] bg-blue-weak/30 p-4" data-testid="negotiation-corridor" aria-label="Negotiation decision">
      <div><h3 className="text-[15px] font-semibold text-ink">How do you want to answer?</h3></div>
      <CorridorAnchors view={view} buyerRequest={buyerRequest} askedPaise={requested?.basis === "including" ? askedPaise : null} />
      {suggested !== null ? <p className="text-[14px] text-muted" data-testid="corridor-lowest">{view.lowestUnavailable === "evaluation_limit" ? "We could not verify a lowest total. Check an amount instead." : safeMinimum === null ? "No lower total is currently verified within your rules." : `The lowest verified total is ${formatINR(safeMinimum)} including GST.`}</p> : null}
      {step === "choose" ? <>
        <ol className="grid gap-3 sm:grid-cols-3" data-testid="corridor-actions" aria-label="Three ways to answer">
          <li className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3" data-testid="path-hold-firm">
            <h4 className="text-[14px] font-semibold text-ink">Hold firm</h4>
            <p className="flex-1 text-[13px] leading-5 text-ink-2">Your offer stays at {formatINR(view.currentTotalPaise)}. Nothing new is sent.</p>
            <DecisionAction testId="keep-current-offer" body={{ action: "review_work", sourceKind: "message", sourceId: requestId, disposition: "keep_current_terms" }} onDone={() => router.refresh()}>Keep {formatINR(view.currentTotalPaise)}</DecisionAction>
          </li>
          <li className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3" data-testid="path-suggested">
            <h4 className="text-[14px] font-semibold text-ink">Suggested counter-offer</h4>
            {suggested !== null ? <>
              <p className="flex-1 text-[13px] leading-5 text-ink-2">The lowest total that meets every one of your rules, worked out by the rules engine.</p>
              <Button variant="primary" className="w-full sm:w-auto" disabled={pending} data-testid="offer-safe-minimum" onClick={offerSafeMinimum}>Offer {formatINR(suggested)}</Button>
            </> : <p className="flex-1 text-[13px] leading-5 text-ink-2" data-testid="suggested-unavailable">{noLowerMessage}</p>}
          </li>
          <li className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3" data-testid="path-own-amount">
            <h4 className="text-[14px] font-semibold text-ink">Choose your own amount</h4>
            <p className="flex-1 text-[13px] leading-5 text-ink-2">Type a total and see what you would keep. You only give a reason if it breaks one of your rules.</p>
            <Button className="w-full sm:w-auto" data-testid="check-buyer-amount" onClick={() => setStep("check")}>Check an amount</Button>
          </li>
        </ol>
        <details className="text-[13px]" data-testid="corridor-more">
          <summary className="cursor-pointer font-semibold text-ink">More options</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            <DecisionAction testId="handle-outside" body={{ action: "review_work", sourceKind: "message", sourceId: requestId, disposition: "handled_outside" }} onDone={() => router.refresh()}>Handle outside Adaptive Deals</DecisionAction>
            <Button data-testid="leave-request-open" onClick={() => setLeftOpen(true)}>Leave request open</Button>
          </div>
        </details>
        {leftOpen ? <p className="rounded-lg bg-surface px-3 py-2 text-[14px] text-ink-2" data-testid="request-left-open">No message or offer will be sent. This request stays open for you to return to.</p> : null}
        <ErrorText error={error} />
      </> : <CounterForm onDone={onDone} onBack={() => setStep("choose")} initial={requested} />}
      <details open className="text-[14px]" data-testid="corridor-ladder"><summary className="cursor-pointer font-semibold text-ink">Approved discount stops</summary>{discountRows.length > 1 ? <ul className="mt-2 space-y-2">{discountRows.map((row) => <li key={row.structureId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2" data-testid={`ladder-${row.discountBps}`}><span>{row.discountBps / 100}% discount · {formatINR(row.totalPaise)} incl. GST</span>{row.isCurrent ? <span className="text-muted">Current offer</span> : row.passes ? <OfferThis offer={row} onDone={onDone} /> : <span className="text-muted">Outside your rules</span>}</li>)}</ul> : <p className="mt-1 text-ink-2">Your prices and costs allow no discount.</p>}</details>
      {view.scopeAlternatives.length || view.timingAlternatives.length ? <details className="text-[13px]" data-testid="corridor-alternatives"><summary className="cursor-pointer font-semibold text-ink">Other ways to respond</summary><ul className="mt-2 space-y-2">{[...view.scopeAlternatives, ...view.timingAlternatives].map((offer) => <li key={offer.structureId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2"><span>{offer.headline} · {formatINR(offer.totalPaise)} incl. GST</span><OfferThis offer={offer} onDone={onDone} /></li>)}</ul></details> : null}
      <p className="text-[14px] text-muted" data-testid="corridor-private">They only see the offer you approve and send, never your costs or rules.</p>
    </section>
  );
}
