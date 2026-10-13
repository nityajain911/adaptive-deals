"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, useAction } from "@/components/client";
import type { CaseId } from "@/data/synthetic/cases";
import type { CasePickerCard } from "@/lib/case-picker-cards";
import type { SituationTone } from "@/lib/deal-situation";
import { Badge, cx } from "@/components/ui";

const DOT: Record<SituationTone, string> = { red: "bg-red", amber: "bg-amber", green: "bg-green", neutral: "bg-line-strong" };
const TEXT: Record<SituationTone, string> = { red: "text-red", amber: "text-amber", green: "text-green", neutral: "text-ink" };

/** The deals as an inbox: who is waiting on the left, and what is in the way, in their own words, on the right. */
export function CasePicker({ cards, activeCaseId, sentTo = null }: { cards: CasePickerCard[]; activeCaseId: CaseId; sentTo?: string | null }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [selected, setSelected] = useState<CaseId>(activeCaseId);
  const card = cards.find((item) => item.id === selected)!;
  const [confirmed, setConfirmed] = useState(sentTo);

  // The confirmation belongs to the moment after sending: take it out of the address so a reload does not repeat it.
  useEffect(() => {
    if (sentTo) window.history.replaceState(null, "", "/deals");
  }, [sentTo]);

  const go = () =>
    run({ action: "open_deal", caseId: selected }, () => {
      // The deal's home sends the merchant to the stage it is actually at.
      router.push("/deals/hero");
      router.refresh();
    });

  return (
    <div className="space-y-3" data-walkthrough="case-picker">
    {confirmed ? <p className="rounded-lg bg-green-weak px-4 py-2 text-[14px] font-medium text-green" role="status" data-testid="offer-sent-confirmation">Offer sent to {confirmed}</p> : null}
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
      <div role="radiogroup" aria-label="Deals" className="h-fit overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        <ul className="divide-y divide-line">
          {cards.map((item) => {
            const chosen = selected === item.id;
            return (
              <li key={item.id} data-testid={`case-card-${item.id}`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  onClick={() => { setSelected(item.id); setConfirmed(null); }}
                  data-testid={`select-case-${item.id}`}
                  className={cx("flex w-full flex-col gap-1 border-l-4 px-4 py-3.5 text-left", chosen ? "border-l-blue bg-blue-weak/50" : "border-l-transparent hover:bg-surface-muted")}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-[15px] font-semibold text-ink">{item.buyer}</span>
                    <span data-testid={`deal-status-${item.id}`} className="flex shrink-0 items-start">
                      <Badge tone={item.status.tone}>{item.status.label}</Badge>
                    </span>
                  </span>
                  <span className="text-[13px] text-muted">{item.title}</span>
                  {item.status.next ? <span className="line-clamp-2 text-[12px] leading-4 text-muted" data-testid={`deal-next-${item.id}`}>{item.status.next}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <section className="min-w-0 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5" aria-label={`${card.buyer}: what is in the way`} data-testid="deal-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-bold tracking-tight text-ink" data-testid="deal-panel-buyer">{card.buyer}</h2>
            <p className="mt-0.5 text-[13px] text-ink-2">{card.proposal}</p>
          </div>
          <div className="flex w-full flex-col items-stretch gap-1 sm:w-auto sm:items-end" data-testid="case-confirmation">
            <Button variant="primary" onClick={go} disabled={pending} data-testid="start-selected-case" className="min-h-11 px-5 text-[15px]">
              {pending ? "Opening…" : card.started ? "Open deal" : "Start deal"} <ArrowRight aria-hidden className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <ErrorText error={error} />

        {card.situation.length ? (
          <div className="mt-4" data-testid="deal-situation">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted">What is in the way</h3>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {card.situation.map((tile) => (
                <li key={tile.id} className="rounded-xl border border-line px-3 py-2.5" data-testid={`tile-${tile.id}`} data-tone={tile.tone}>
                  <div className="text-[12px] font-semibold text-muted">{tile.heading}</div>
                  <div className={cx("mt-0.5 flex items-center gap-1.5 text-[15px] font-semibold", TEXT[tile.tone])}><span aria-hidden className={cx("h-2.5 w-2.5 shrink-0 rounded-full", DOT[tile.tone])} />{tile.value}</div>
                  {tile.detail ? <div className="mt-0.5 text-[13px] text-ink-2">{tile.detail}</div> : null}
                  {tile.quote ? <div className="mt-1 text-[12px] italic text-muted">“{tile.quote.replace(/\.$/, "")}”</div> : null}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-muted" data-testid="situation-source">From their messages ({card.modelOutput.toLowerCase().startsWith("recorded") ? card.modelOutput : "hand-written sample"}). Verdicts are worked out by code.</p>
          </div>
        ) : null}

        <div className="mt-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted">What they said</h3>
          <ol className="mt-2 max-h-[300px] space-y-2 overflow-y-auto rounded-xl bg-[#efeae2] p-3" aria-label={`Messages with ${card.buyer} (simulated WhatsApp)`} data-testid="deal-conversation" tabIndex={0}>
            {card.messages.map((message) => (
              <li key={message.id} className={cx("max-w-[88%] rounded-lg px-3 py-2 text-[14px] leading-5 text-ink shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]", message.author === "merchant" ? "ml-auto rounded-tr-none bg-[#d9fdd3]" : "rounded-tl-none bg-white")}>
                <span className="block text-[12px] font-semibold text-ink-2">{message.author === "merchant" ? "You" : card.buyer}</span>
                {message.text}
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
    </div>
  );
}
