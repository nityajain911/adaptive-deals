"use client";

import { useRouter } from "next/navigation";
import { Button, ErrorText, useAction } from "../client";
import { Badge } from "../ui";
import { CounterForm } from "./counter-form";
import { approxINR } from "@/lib/offer-copy";
import { formatINR } from "@/domain/money";
import type { CorridorOffer, CorridorView } from "@/lib/service";

const approvalText = (a: CorridorOffer["approval"]) => (a === "requires_approval" ? "Needs MD approval" : "Within the buyer's approval limit");

function OfferThis({ offer, onDone }: { offer: CorridorOffer; onDone: string }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  return (
    <div className="shrink-0">
      <Button disabled={pending} data-testid={`offer-this-${offer.structureId}`} onClick={() => run({ action: "answer_with_offer", structureId: offer.structureId }, () => router.push(onDone))}>
        {pending ? "Preparing…" : "Offer this"}
      </Button>
      <ErrorText error={error} />
    </div>
  );
}

/**
 * What a buyer's request for a lower price does to the merchant's economics, and the ways to answer
 * it. Everything here is computed by code from the engine. The buyer sees only the offer the merchant
 * chooses to send; none of these limits is ever sent.
 */
export function NegotiationCorridor({ view, onDone }: { view: CorridorView; onDone: string }) {
  const lowest = view.lowestCompliantPaise;
  const permitsDiscount = view.ladder.some((row) => row.discountBps > 0);
  return (
    <section className="mt-3 space-y-4 rounded-xl border border-[#d6defe] bg-blue-weak/30 p-4" data-testid="negotiation-corridor" aria-label="Negotiation corridor">
      <div>
        <h3 className="text-[15px] font-semibold text-ink">The buyer asked for a lower price.</h3>
        <p className="text-[13px] text-ink-2">Current offer: {formatINR(view.currentTotalPaise)} including GST. Here is what your own rules allow.</p>
      </div>

      <p className="text-[14px] text-ink" data-testid="corridor-lowest">
        {view.lowestUnavailable === "evaluation_limit"
          ? "We couldn’t calculate a safe lower limit automatically. Review the amount manually."
          : lowest === null
            ? "The current offer does not meet every rule under your present economics."
            : lowest >= view.currentTotalPaise
              ? "No lower total meets every rule."
              : `Lowest total that meets every rule for this scope: ${formatINR(lowest)} including GST.`}
      </p>

      <div data-testid="corridor-ladder">
        <h4 className="text-[14px] font-semibold text-ink">Discounts your business economics permit</h4>
        {permitsDiscount ? (
          <ul className="mt-1 divide-y divide-line rounded-lg border border-line bg-surface">
            {view.ladder.map((row) => (
              <li key={row.structureId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[14px]" data-testid={`ladder-${row.discountBps}`}>
                <div className="min-w-0">
                  <span className="font-semibold text-ink">{row.discountBps === 0 ? "No discount" : `${row.discountBps / 100}% discount`}</span>
                  {row.isCurrent ? <Badge tone="neutral" className="ml-2">Current offer</Badge> : null}
                  <div className="text-[13px] text-ink-2">
                    {formatINR(row.totalPaise)} including GST · you keep about {approxINR(row.contributionPaise).replace(/^about /, "")} · {approvalText(row.approval)}
                    {row.passes ? "" : " · does not meet every rule"}
                  </div>
                </div>
                {!row.isCurrent && row.passes ? <OfferThis offer={row} onDone={onDone} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[14px] text-ink-2">Your business economics permit no discount.</p>
        )}
      </div>

      {view.scopeAlternatives.length || view.timingAlternatives.length ? (
        <div data-testid="corridor-alternatives">
          <h4 className="text-[14px] font-semibold text-ink">Other ways to lower the buyer&apos;s payment</h4>
          <ul className="mt-1 divide-y divide-line rounded-lg border border-line bg-surface">
            {[...view.scopeAlternatives.map((o) => ({ o, kind: "A smaller scope" })), ...view.timingAlternatives.map((o) => ({ o, kind: "The same scope, paid differently" }))].map(({ o, kind }) => (
              <li key={o.structureId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[14px]" data-testid={`alternative-${o.structureId}`}>
                <div className="min-w-0">
                  <div className="font-semibold text-ink">{o.headline}</div>
                  <div className="text-[13px] text-ink-2">{kind} · {formatINR(o.totalPaise)} including GST · you keep about {approxINR(o.contributionPaise).replace(/^about /, "")} · {approvalText(o.approval)}</div>
                </div>
                <OfferThis offer={o} onDone={onDone} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-[13px] text-muted">Choosing an offer withdraws the version you sent and prepares the new one for your review. Nothing reaches the buyer until you approve and send it.</p>

      <CounterForm onDone={onDone} />
      <p className="text-[13px] text-muted" data-testid="corridor-private">The buyer sees only the offer you choose. Your limits are never sent.</p>
    </section>
  );
}
