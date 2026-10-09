import { formatINR } from "@/domain/money";

/**
 * Money moving from the deal toward the merchant, drawn like the earnings flow on the Razorpay home:
 * two tiles joined by a curve whose dashes travel left to right, and a bar that fills to the share
 * already collected. Display only; the amounts come from the contract's financial view.
 */
export function CollectionFlow({ totalPaise, collectedPaise }: { totalPaise: number; collectedPaise: number }) {
  if (totalPaise <= 0) return null;
  const share = Math.max(0, Math.min(1, collectedPaise / totalPaise));
  return (
    <figure className="mt-4" data-testid="collection-flow" aria-label={`${formatINR(collectedPaise)} of ${formatINR(totalPaise)} collected`}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="rounded-xl border border-line bg-surface px-3 py-2">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Deal total</div>
          <div className="tabular text-[16px] font-semibold text-ink">{formatINR(totalPaise)}</div>
        </div>
        <svg viewBox="0 0 80 32" className="h-8 w-16 sm:w-24" aria-hidden>
          <path d="M0 16 C 26 2, 54 30, 80 16" fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" className="collection-flow-line" />
        </svg>
        <div className="rounded-xl border border-line bg-surface px-3 py-2">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Collected</div>
          <div className="tabular text-[16px] font-semibold text-green">{formatINR(collectedPaise)}</div>
        </div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
        <div className="money-split-segment h-full rounded-full bg-green" style={{ width: `${share * 100}%` }} />
      </div>
    </figure>
  );
}
