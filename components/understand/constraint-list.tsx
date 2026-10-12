"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Check, Clock } from "lucide-react";
import type { ConstraintRow } from "@/lib/understand-copy";
import { cx } from "../ui";

export interface ConstraintFlag {
  tone: "warn" | "ok" | "wait";
  text: string;
  /** The element the flag leads to: the drafted questions, or the services question. */
  target: string | null;
}
export type ConstraintItem = ConstraintRow & { flag: ConstraintFlag | null };

const FLAG_STYLE = { warn: "bg-amber-weak text-amber", ok: "bg-green-weak text-green", wait: "bg-blue-weak text-blue-ink" } as const;
const FLAG_ICON = { warn: AlertTriangle, ok: Check, wait: Clock } as const;

/** Bring an element into view and flash it, so the eye lands where the value or question is. */
function flash(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  el.focus({ preventScroll: true });
  el.setAttribute("data-flash", "true");
  window.setTimeout(() => el.removeAttribute("data-flash"), 1700);
}

/**
 * What stands between the buyer and the quote, one fact per row. A value that was read from the buyer's words shows
 * those words on hover, focus or tap, with a link to the message. What still needs asking is flagged on the row it affects.
 */
export function ConstraintList({ items }: { items: ConstraintItem[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLUListElement>(null);
  const base = useId();
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", escape); };
  }, [open]);

  return (
    <ul ref={root} className="mt-2 divide-y divide-line" data-testid="constraint-list">
      {items.map((item) => {
        const Icon = item.flag ? FLAG_ICON[item.flag.tone] : null;
        const sourced = item.evidence.length > 0;
        const panel = `${base}-${item.id}`;
        return (
          <li key={item.id} className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 py-2.5 text-[14px]" data-testid={`constraint-${item.id}`} onMouseLeave={() => setOpen((current) => (current === item.id ? null : current))}>
            <span className="text-ink-2">{item.label}</span>
            <div className="min-w-0">
              {sourced ? (
                <button
                  type="button"
                  className="text-left text-ink underline decoration-dotted decoration-muted underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
                  aria-expanded={open === item.id}
                  aria-controls={panel}
                  onMouseEnter={() => setOpen(item.id)}
                  onClick={() => setOpen(open === item.id ? null : item.id)}
                  data-testid={`value-${item.id}`}
                >
                  {item.value}
                </button>
              ) : <span className="text-ink" data-testid={`value-${item.id}`}>{item.value}</span>}
              {item.note ? <span className="block text-[13px] text-ink-2">{item.note}</span> : null}
              {item.flag && Icon ? (
                item.flag.target ? (
                  <button type="button" onClick={() => flash(item.flag!.target!)} className={cx("mt-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium", FLAG_STYLE[item.flag.tone])} data-testid={`flag-${item.id}`}>
                    <Icon aria-hidden className="h-3.5 w-3.5" />{item.flag.text}
                  </button>
                ) : (
                  <span className={cx("mt-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium", FLAG_STYLE[item.flag.tone])} data-testid={`flag-${item.id}`}>
                    <Icon aria-hidden className="h-3.5 w-3.5" />{item.flag.text}
                  </span>
                )
              ) : null}
              {sourced && open === item.id ? (
                <div id={panel} role="region" aria-label="Where this came from" className="mt-1.5 rounded-lg border border-line bg-surface-muted px-3 py-2 text-[13px]" data-testid={`source-${item.id}`}>
                  {item.evidence.map((e, i) => <p key={i} className="italic text-ink-2">“{e.quote.replace(/\.$/, "")}”</p>)}
                  <button type="button" className="mt-1 font-semibold text-blue hover:underline" onClick={() => flash(`source-${item.evidence[0]!.messageId}`)} data-testid={`show-in-chat-${item.id}`}>Show in chat</button>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
