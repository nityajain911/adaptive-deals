"use client";

import type { EconomicsContent } from "@/domain/business-economics";
import { formatINR } from "@/domain/money";
import { whatIf } from "@/lib/what-if";

/** Live, read-only preview of what the limits above mean. It updates as you type and saves nothing. */
export function WhatIfPanel({ content }: { content: Pick<EconomicsContent, "services" | "guardrails" | "fixed"> }) {
  const result = whatIf(content);
  const floor = content.guardrails.contributionFloor;
  const limit = floor.minPercentBps !== null ? `${floor.minPercentBps / 100}% of the price` : floor.minPaise !== null ? formatINR(floor.minPaise) : null;
  return (
    <aside className="rounded-[var(--radius-card)] border border-[#d6defe] bg-blue-weak/40 p-4 sm:p-5 lg:sticky lg:top-4" data-testid="what-if" aria-live="polite" aria-label="What these limits mean">
      <h2 className="text-[16px] font-semibold text-ink">What these limits mean</h2>
      <p className="mt-1 text-[13px] leading-5 text-ink-2" data-testid="what-if-headline">
        {limit ? `Offers under ${limit} profit won't be suggested.` : "With no lowest profit, any price above your cost can be suggested."}
      </p>
      {result.unreachable ? <p className="mt-3 rounded-lg border border-[#f6cfc9] bg-red-weak px-3 py-2 text-[13px] font-semibold text-red" data-testid="what-if-unreachable">With these numbers no price can reach your lowest profit. Lower it or the payment fee.</p> : null}
      <dl className="mt-3 divide-y divide-line text-[13px]">
        {result.rows.map((row) => (
          <div key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2" data-testid={`what-if-${row.id}`}>
            <dt className="font-medium text-ink">{row.name}</dt>
            <dd className="text-right text-ink-2">{row.lowestPaise === null ? "No price works" : <>never below <span className="font-semibold text-ink">{formatINR(row.lowestPaise)}</span></>}{row.lowestPaise !== null && row.setBy === "profit" && row.lowestPaise > row.standardPaise ? <span className="block text-[12px] text-muted">your profit limit is above the standard price {formatINR(row.standardPaise)}</span> : row.lowestPaise !== null && row.setBy === "profit" ? <span className="block text-[12px] text-muted">standard {formatINR(row.standardPaise)}</span> : null}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
