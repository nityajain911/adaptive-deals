"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { ErrorText, useAction } from "../client";

/**
 * What the code read from a buyer's reply, under that reply. While the offer is not yet chosen, "Change" swaps it for the
 * other answer; the buyer's own words stay as they were.
 */
export function AnswerChip({ questionId, label, others }: { questionId: string; label: string; others: { value: string; label: string }[] | null }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px]" data-testid={`answer-${questionId}`}>
      <span className="inline-flex items-center gap-1 rounded-md border border-[#9bd3ae] bg-green-weak px-2 py-0.5 font-medium text-green">
        <Check aria-hidden className="h-3.5 w-3.5" /> {label}
      </span>
      {others ? (
        open ? (
          others.map((o) => (
            <button key={o.value} type="button" disabled={pending} className="rounded-md border border-line-strong bg-white px-2 py-0.5 font-medium text-ink hover:bg-surface-muted" data-testid={`change-${questionId}-${o.value}`} onClick={() => run({ action: "change_answer", questionId, value: o.value }, () => { setOpen(false); router.refresh(); })}>
              {o.label}
            </button>
          ))
        ) : (
          <button type="button" className="text-ink-2 underline underline-offset-2 hover:text-ink" data-testid={`change-${questionId}`} onClick={() => setOpen(true)}>
            Change
          </button>
        )
      ) : null}
      <ErrorText error={error} />
    </div>
  );
}
