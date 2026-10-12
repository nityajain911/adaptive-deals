"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button, ErrorText, useAction } from "../client";
import { InfoButton } from "../info-button";

export interface DraftQuestion {
  questionId: string;
  text: string;
  why: string;
}

/**
 * The clarifying questions as drafts at the foot of the conversation, where the merchant is already reading. Each is the
 * words to send and can be reworded in place; one button sends them all. After they are sent, this holds what the merchant does
 * next with the replies.
 */
/** One question as an obvious text field: bordered, with a pencil that puts the cursor in it, and tall enough to show all of it in any browser. */
function DraftField({ index, testId, value, onChange }: { index: number; testId: string; value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <div className="flex min-w-0 flex-1 items-start gap-1.5 rounded-md border border-line-strong bg-white px-2 py-1 focus-within:border-blue focus-within:ring-2 focus-within:ring-blue/20">
      <textarea
        ref={ref}
        aria-label={`Question ${index + 1}, editable`}
        data-testid={testId}
        className="min-h-6 w-full flex-1 resize-none bg-transparent text-[14px] leading-5 text-ink focus:outline-none"
        rows={1}
        maxLength={300}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="button" aria-label={`Edit question ${index + 1}`} data-testid={`edit-${testId}`} className="mt-0.5 shrink-0 rounded p-1 text-muted hover:bg-surface-muted hover:text-ink" onClick={() => { ref.current?.focus(); ref.current?.setSelectionRange(value.length, value.length); }}>
        <Pencil aria-hidden className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ClarificationDrafts({ drafts, wordingLabel, sendLabel, next, interpret }: { drafts: DraftQuestion[]; wordingLabel: string | null; sendLabel: string | null; next: { label: string; action: "adopt_replies" | "understand_reviewed"; onDone: string } | null; interpret: ReactNode }) {
  const router = useRouter();
  const send = useAction();
  const move = useAction();
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries(drafts.map((draft) => [draft.questionId, draft.text])));
  const edits = Object.fromEntries(drafts.filter((draft) => (texts[draft.questionId] ?? draft.text).trim() !== draft.text).map((draft) => [draft.questionId, texts[draft.questionId]!.trim()]));
  const tooShort = drafts.some((draft) => (texts[draft.questionId] ?? draft.text).trim().length < 5);

  if (!drafts.length && !interpret && !next) return null;
  return (
    <div className="space-y-3" id="clarification-drafts" tabIndex={-1} data-testid="clarification-drafts">
      {drafts.length ? (
        <div className="rounded-xl border-[1.5px] border-dashed border-[#8696a0] bg-white/70 p-2.5">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#41525d]">
            <span className="font-semibold">Suggested questions · not sent</span>
            <span className="inline-flex items-center gap-1"><Pencil aria-hidden className="h-3 w-3" /> You can reword them</span>
          </div>
          <ol className="space-y-1.5">
            {drafts.map((draft, index) => (
              <li key={draft.questionId} className="flex items-start gap-2" data-testid={`draft-${draft.questionId}`}>
                <DraftField index={index} testId={`draft-text-${draft.questionId}`} value={texts[draft.questionId] ?? draft.text} onChange={(value) => setTexts((current) => ({ ...current, [draft.questionId]: value }))} />
                <InfoButton label="Why this question matters" testId={`why-${draft.questionId}`}>{draft.why}</InfoButton>
              </li>
            ))}
          </ol>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12px] text-[#41525d]" data-testid="draft-wording">{Object.keys(edits).length ? "Edited by you" : wordingLabel}</span>
            {sendLabel ? <Button variant="primary" disabled={send.pending || tooShort} data-testid="primary-action" onClick={() => send.run({ action: "send_questions", edits }, () => router.refresh())}>{send.pending ? "Sending…" : sendLabel}</Button> : null}
          </div>
          <ErrorText error={send.error} />
        </div>
      ) : null}
      {interpret}
      {next ? (
        <div className="flex justify-end">
          <Button variant="primary" disabled={move.pending} data-testid="primary-action" onClick={() => move.run({ action: next.action }, () => router.push(next.onDone))}>{move.pending ? "Working…" : next.label}</Button>
          <ErrorText error={move.error} />
        </div>
      ) : null}
    </div>
  );
}
