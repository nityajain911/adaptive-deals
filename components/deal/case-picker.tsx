"use client";

import { useState } from "react";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, useAction } from "@/components/client";
import type { CaseId, DemoCase } from "@/data/synthetic/cases";
import { Badge, Card, cx } from "@/components/ui";

export const CASE_SWITCH_WARNING = "Starting a new deal clears the current one.";

export interface CasePickerCard {
  id: CaseId;
  title: string;
  buyer: string;
  proposal: string;
  barrier: string;
  proofPoint: string;
  provenance: DemoCase["provenance"];
  /** Who produced this case's model-task outputs: a recorded model run or a hand-written sample. */
  modelOutput: string;
  current: boolean;
  actionLabel: "Start this deal";
}

export function casePickerCards(cases: DemoCase[], activeId: CaseId, modelOutput: Record<CaseId, string>): CasePickerCard[] {
  return cases.map((item) => ({
    id: item.id,
    title: item.title,
    buyer: item.buyer.name,
    proposal: item.proposalSummary,
    barrier: item.barrier,
    proofPoint: item.proofPoint,
    provenance: item.provenance,
    modelOutput: modelOutput[item.id],
    current: item.id === activeId,
    actionLabel: "Start this deal",
  }));
}

export function CasePicker({ cards, activeCaseId }: { cards: CasePickerCard[]; activeCaseId: CaseId }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [selected, setSelected] = useState<CaseId>(activeCaseId);
  const selectedCard = cards.find((card) => card.id === selected)!;

  const start = () =>
    run({ action: "start_case", caseId: selected }, () => {
      router.push("/deals/hero/understand");
      router.refresh();
    });

  return (
    <div className="space-y-5" data-walkthrough="case-picker">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3" role="radiogroup" aria-label="Deals to start">
        {cards.map((card) => {
          const chosen = selected === card.id;
          return (
            <Card key={card.id} as="article" className={cx("relative overflow-hidden transition", chosen && "border-[#7d98ff] ring-2 ring-[#dfe6ff]")} data-testid={`case-card-${card.id}`}>
              <button type="button" role="radio" aria-checked={chosen} className="w-full p-5 text-left" onClick={() => setSelected(card.id)} data-testid={`select-case-${card.id}`}>
                <div className="flex min-h-7 flex-wrap items-center gap-2">
                  {card.current ? <Badge tone="blue">In progress</Badge> : null}
                  {chosen ? <Check aria-hidden className="ml-auto h-4 w-4 text-blue" /> : null}
                </div>
                                <h2 className="mt-3 text-[17px] font-semibold leading-6 text-ink">{card.title}</h2>
                <p className="mt-1 text-[14px] font-medium text-ink-2">{card.buyer}</p>
                <dl className="mt-4 space-y-3 text-[13px] leading-5">
                  <div>
                    <dt className="text-[13px] font-semibold uppercase tracking-wide text-muted">Your quote</dt>
                    <dd className="mt-0.5 text-ink-2">{card.proposal}</dd>
                  </div>
                  <div>
                    <dt className="text-[13px] font-semibold uppercase tracking-wide text-muted">What&apos;s in the way</dt>
                    <dd className="mt-0.5 text-ink">{card.barrier}</dd>
                  </div>
                </dl>
              </button>
            </Card>
          );
        })}
      </div>

      <Card className="p-5" data-testid="case-confirmation">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[14px] font-semibold text-ink">
              <ShieldCheck aria-hidden className="h-4 w-4 text-blue" /> {selectedCard.buyer}
            </div>
            <p className="mt-1 text-[13px] text-amber" data-testid="case-switch-warning">{CASE_SWITCH_WARNING}</p>
                      </div>
          <Button variant="primary" onClick={start} disabled={pending} data-testid="start-selected-case" className="shrink-0">
            {pending ? "Starting…" : selectedCard.actionLabel} <ArrowRight aria-hidden className="h-4 w-4" />
          </Button>
        </div>
        <ErrorText error={error} />
      </Card>
    </div>
  );
}
