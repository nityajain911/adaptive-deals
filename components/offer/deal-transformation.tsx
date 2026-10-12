import { formatINR } from "@/domain/money";
import type { DealTransformation } from "@/lib/deal-transformation";

/** The original quote and the offer as one list: what stays is shown once, what changed shows the old value struck through. */
export function DealTransformationCard({ value }: { value: DealTransformation }) {
  return (
    <section className="border-b border-line px-5 py-4" aria-label="What changed from the original quote" data-testid="deal-transformation">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tabular text-[30px] font-bold tracking-tight text-ink" data-testid="offer-total">{formatINR(value.adaptive.totalPaise)}</span>
        <span className="text-[13px] text-muted">including GST</span>
        {value.adaptive.totalPaise !== value.original.totalPaise ? <span className="tabular text-[15px] text-muted line-through" data-testid="offer-was">{formatINR(value.original.totalPaise)}</span> : null}
      </div>
      <ul className="mt-3 divide-y divide-line text-[14px]" data-testid="transformation-rows">
        {(value.rows ?? []).map((row) => {
          const removed = row.now === null;
          const same = row.was === row.now;
          return (
            <li key={row.id} className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-1 py-1.5 ${removed ? "bg-red-weak" : ""}`} data-row={row.id} data-testid={row.id === "approval" ? "offer-approval" : undefined} data-change={removed ? "removed" : same ? "same" : row.was === null ? "added" : "changed"}>
              <span className={removed ? "text-muted line-through" : "text-ink"}>{row.label}</span>
              <span className="tabular flex flex-wrap items-baseline gap-x-2 text-right">
                {removed ? <span className="text-[13px] text-ink-2">{row.note}</span> : same ? <span className="text-ink-2">{row.now}</span> : (
                  <>
                    {row.was ? <span className="text-muted line-through">{row.was}</span> : null}
                    <span className={row.id === "approval" && row.now?.startsWith("Needs") ? "font-medium text-amber" : "font-medium text-ink"}>{row.now}</span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {value.economicsChanged ? <p className="mt-2 text-[14px] text-ink-2">Your prices or costs changed in version {value.economicsChanged.toVersion}. This offer now keeps {formatINR(value.economicsChanged.contributionDeltaPaise)} {value.economicsChanged.contributionDeltaPaise < 0 ? "less" : "more"} after costs.</p> : null}
    </section>
  );
}
