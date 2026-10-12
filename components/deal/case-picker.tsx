"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, useAction } from "@/components/client";
import type { CaseId } from "@/data/synthetic/cases";
import { CASE_SWITCH_NOTE, type CasePickerCard } from "@/lib/case-picker-cards";
import { Badge, cx } from "@/components/ui";

/** The three deal stories as one table, each with its own progress. Choose a row, then open or start it. */
export function CasePicker({ cards, activeCaseId }: { cards: CasePickerCard[]; activeCaseId: CaseId }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [selected, setSelected] = useState<CaseId>(activeCaseId);
  const selectedCard = cards.find((card) => card.id === selected)!;
  const opens = selectedCard.started;

  const go = () =>
    run({ action: "open_deal", caseId: selected }, () => {
      // The deal's home sends the merchant to the stage it is actually at.
      router.push("/deals/hero");
      router.refresh();
    });

  return (
    <div className="space-y-3" data-walkthrough="case-picker">
      <div role="radiogroup" aria-label="Deals" className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        <div aria-hidden className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(0,1fr)_24px] gap-4 border-b border-line bg-surface-muted px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-muted md:grid">
          <span>Buyer</span><span>What&apos;s in the way</span><span>Status</span><span />
        </div>
        <ul className="divide-y divide-line">
          {cards.map((card) => {
            const chosen = selected === card.id;
            return (
              <li key={card.id} data-testid={`case-card-${card.id}`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  onClick={() => setSelected(card.id)}
                  data-testid={`select-case-${card.id}`}
                  className={cx("grid w-full grid-cols-1 items-center gap-x-4 gap-y-1 px-4 py-3.5 text-left md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(0,1fr)_24px]", chosen ? "bg-blue-weak/50" : "hover:bg-surface-muted")}
                >
                  <span className="min-w-0"><span className="block text-[15px] font-semibold text-ink">{card.buyer}</span><span className="block text-[13px] text-muted">{card.title}</span></span>
                  <span className="text-[13px] leading-5 text-ink-2">{card.barrier}</span>
                  <span className="min-w-0" data-testid={`deal-status-${card.id}`}>
                    <span className="flex flex-wrap items-center gap-2"><Badge tone={card.status.tone}>{card.status.label}</Badge>{card.current ? <span className="text-[12px] text-muted">Open now</span> : null}</span>
                    {card.status.next ? <span className="mt-1 block text-[12px] leading-4 text-muted" data-testid={`deal-next-${card.id}`}>{card.status.next}</span> : null}
                  </span>
                  <span className="hidden justify-end md:flex">{chosen ? <Check aria-hidden className="h-4 w-4 text-blue" /> : null}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" data-testid="case-confirmation">
        <p className="min-h-5 text-[13px] text-muted" data-testid="case-switch-warning">{selectedCard.current ? "" : CASE_SWITCH_NOTE}</p>
        <Button variant="primary" onClick={go} disabled={pending} data-testid="start-selected-case" className="shrink-0">
          {pending ? "Opening…" : opens ? "Open deal" : "Start deal"} <ArrowRight aria-hidden className="h-4 w-4" />
        </Button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}
