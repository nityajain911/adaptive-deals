"use client";

import { formatINR } from "@/domain/money";
import { Button, ErrorText, useAction } from "../client";

/**
 * The step right after the buyer accepts: pay the upfront amount and authorise automatic payment for the
 * rest, in one tap, on the same page. The click is a simulated payment (no real money moves, and no card or
 * UPI details are asked for); the page footer says so.
 */
export function SetupPanel({
  payNow,
  autopay,
  realLinkUrl,
}: {
  payNow: { amountPaise: number } | null;
  autopay: { amountPaise: number; dateLabel: string; noticeDays: number } | null;
  realLinkUrl: string | null;
}) {
  const { run, pending, error } = useAction();
  const label = payNow && autopay ? `Pay ${formatINR(payNow.amountPaise)} and set up auto-pay` : payNow ? `Pay ${formatINR(payNow.amountPaise)}` : "Set up automatic payment";
  return (
    <section aria-labelledby="setup-title" className="space-y-3 rounded-2xl border border-[#c7d3ff] bg-blue-weak px-4 py-4" data-testid="setup-panel">
      <h2 id="setup-title" className="text-[16px] font-semibold text-ink">
        One last step to start
      </h2>
      <ul className="space-y-1 text-[14px] leading-5 text-ink-2">
        {payNow ? <li>Pay {formatINR(payNow.amountPaise)} now.</li> : null}
        {autopay ? (
          <li>
            Your next payment of {formatINR(autopay.amountPaise)} is then collected automatically on {autopay.dateLabel}. We remind you {autopay.noticeDays} days before.
          </li>
        ) : null}
      </ul>
      {realLinkUrl ? (
        <a href={realLinkUrl} className="block rounded-lg bg-blue px-4 py-3 text-center text-[15px] font-semibold text-white" data-testid="setup-real-link">
          Open the Razorpay test payment link
        </a>
      ) : (
        <Button variant="primary" className="min-h-12 w-full text-[15px]" disabled={pending} data-testid="setup-pay" onClick={() => run({ action: "buyer_complete_setup" })}>
          {pending ? "Working…" : label}
        </Button>
      )}
      <ErrorText error={error} />
    </section>
  );
}

/** What the buyer sees once setup is complete. */
export function SetupDone({ paidPaise, next }: { paidPaise: number | null; next: { amountPaise: number; dateLabel: string } | null }) {
  return (
    <section aria-label="Payment status" className="rounded-2xl border border-[#bfe5d3] bg-green-weak px-4 py-4 text-[14px] leading-5 text-ink" data-testid="setup-done">
      <div className="text-[16px] font-semibold text-green">All set</div>
      <p className="mt-1">
        {paidPaise !== null ? `${formatINR(paidPaise)} paid.` : "Your payment is set up."}
        {next ? ` Next: ${formatINR(next.amountPaise)} on ${next.dateLabel}, collected automatically.` : ""}
      </p>
    </section>
  );
}
