"use client";

import { useState } from "react";
import type { ChatHighlight } from "@/lib/chat-highlights";
import { cx } from "../ui";

/**
 * A buyer message with the phrases the constraints came from marked in place. Clicking a phrase
 * opens one short note under the message: what the code understood, and how it normalised it.
 */
export function HighlightedText({ text, highlights }: { text: string; highlights: ChatHighlight[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const parts: React.ReactNode[] = [];
  let pos = 0;
  highlights.forEach((h, i) => {
    if (h.start > pos) parts.push(text.slice(pos, h.start));
    parts.push(
      <button
        key={i}
        type="button"
        data-testid="chat-highlight"
        data-kind={h.kind}
        aria-expanded={open === i}
        onClick={() => setOpen(open === i ? null : i)}
        className={cx("rounded-[3px] px-0.5 text-left font-medium text-ink shadow-[inset_0_-2px_0] hover:brightness-95", h.kind === "rejected" ? "bg-[#ffe9b8] shadow-[#e0a21b]" : "bg-[#fff1c2] shadow-[#f2c94c]")}
      >
        {text.slice(h.start, h.end)}
      </button>,
    );
    pos = h.end;
  });
  parts.push(text.slice(pos));
  const note = open === null ? null : highlights[open];
  return (
    <>
      <p className="text-[15px] leading-6 text-ink [overflow-wrap:anywhere]">{parts}</p>
      {note ? (
        <div className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-[13px] text-ink-2" data-testid="chat-highlight-note" role="status">
          <span className="font-semibold text-ink">{note.label}</span>
          {note.detail ? <span>: {note.detail}</span> : null}
          {note.normalisation && note.normalisation !== note.detail ? <div className="mt-0.5 text-muted">Read as {note.normalisation}</div> : null}
        </div>
      ) : null}
    </>
  );
}
