"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleHelp, Clock } from "lucide-react";
import { evidenceKey } from "../chat/highlighted-text";
import type { ConstraintRow } from "@/lib/understand-copy";
import { cx } from "../ui";

/**
 * An unknown, drawn as an empty slot until it is known. `empty`: not asked yet. `asked`: the question is out.
 * `filled`: the buyer's reply was read and gives the answer. `reading`: a reply came that the rules could not read.
 * `action`: a decision only the merchant can make.
 */
export interface ConstraintSlot {
  state: "empty" | "asked" | "filled" | "reading" | "action";
  label: string;
  filled?: string;
  /** The element the slot leads to: the draft, the buyer's reply, or the services question. */
  target: string | null;
}
export type ConstraintItem = ConstraintRow & { slot: ConstraintSlot | null };

/** Bring an element into view and flash it, so the eye lands where the question or reply is. */
function flash(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  el.focus({ preventScroll: true });
  el.setAttribute("data-flash", "true");
  window.setTimeout(() => el.removeAttribute("data-flash"), 1700);
}

/** Light up (or clear) the sentences in the chat that a fact was read from. Nothing in the chat is painted otherwise. */
function light(selectors: string[], on: boolean) {
  let first: Element | null = null;
  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((el) => {
      if (on) { el.setAttribute("data-lit", "true"); first ??= el; } else el.removeAttribute("data-lit");
    });
  }
  if (on && first) (first as Element).scrollIntoView({ block: "nearest", behavior: "smooth" });
}

const evidenceSelectors = (item: ConstraintItem) => item.evidence.map((e) => `[data-ev-key="${evidenceKey(e.messageId, e.start, e.end)}"]`);

/**
 * What stands between the buyer and the quote, one fact per row. Pointing at a fact lights the sentence it was read from
 * in the chat. What is still unknown sits next to its fact as an empty slot that fills, with a check, when the buyer answers.
 */
export function ConstraintList({ items }: { items: ConstraintItem[] }) {
  const [pinned, setPinned] = useState<string | null>(null);
  const previous = useRef<Map<string, ConstraintSlot["state"]>>(new Map());
  const root = useRef<HTMLUListElement>(null);

  // A slot that was empty and is now filled pops once (a change to the page itself, not to React state). The first render never animates.
  useEffect(() => {
    const timers: number[] = [];
    for (const item of items) {
      const before = previous.current.get(item.id);
      if (item.slot?.state === "filled" && before && before !== "filled") {
        const el = root.current?.querySelector(`[data-testid="slot-${item.id}"]`);
        el?.setAttribute("data-slot-pop", "true");
        timers.push(window.setTimeout(() => el?.removeAttribute("data-slot-pop"), 1000));
      }
      previous.current.set(item.id, item.slot?.state ?? "empty");
    }
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [items]);

  useEffect(() => {
    if (!pinned) return;
    const away = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) { light(["[data-lit]"], false); setPinned(null); } };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { light(["[data-lit]"], false); setPinned(null); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", escape); };
  }, [pinned]);

  return (
    <ul ref={root} className="mt-2 divide-y divide-line" data-testid="constraint-list">
      {items.map((item) => {
        const sourced = item.evidence.length > 0;
        const slot = item.slot;
        const selectors = evidenceSelectors(item);
        const slotSelectors = slot?.state === "action" ? ['[data-kind="rejected"][data-ev-key]'] : [];
        return (
          <li key={item.id} className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 py-2.5 text-[14px]" data-testid={`constraint-${item.id}`}>
            <span className="text-ink-2">{item.label}</span>
            <div className="min-w-0">
              {sourced ? (
                <button
                  type="button"
                  className={cx("text-left text-ink underline decoration-dotted decoration-muted underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue", pinned === item.id && "decoration-solid")}
                  aria-pressed={pinned === item.id}
                  onMouseEnter={() => light(selectors, true)}
                  onMouseLeave={() => { if (pinned !== item.id) light(selectors, false); }}
                  onFocus={() => light(selectors, true)}
                  onBlur={() => { if (pinned !== item.id) light(selectors, false); }}
                  onClick={() => { light(["[data-lit]"], false); if (pinned === item.id) setPinned(null); else { light(selectors, true); setPinned(item.id); } }}
                  data-testid={`value-${item.id}`}
                >
                  {item.value}
                </button>
              ) : <span className="text-ink" data-testid={`value-${item.id}`}>{item.value}</span>}
              {item.note ? <span className="block text-[13px] text-ink-2">{item.note}</span> : null}
              {slot ? (
                <button
                  type="button"
                  disabled={!slot.target && slot.state !== "action"}
                  onClick={() => { if (slot.target) flash(slot.target); }}
                  onMouseEnter={() => light(slotSelectors, true)}
                  onMouseLeave={() => light(slotSelectors, false)}
                  onFocus={() => light(slotSelectors, true)}
                  onBlur={() => light(slotSelectors, false)}
                  data-testid={`slot-${item.id}`}
                  data-state={slot.state}
                  aria-label={slot.state === "filled" ? `${slot.label} ${slot.filled}` : slot.state === "asked" ? `${slot.label} Asked, waiting for the reply` : slot.label}
                  className={cx(
                    "mt-1 flex w-fit items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-medium",
                    slot.state === "filled" ? "border-[var(--border-success,#9bd3ae)] bg-green-weak text-green" : slot.state === "reading" || slot.state === "action" ? "border-dashed border-[#e0a21b] bg-amber-weak text-amber" : "border-dashed border-line-strong text-ink-2",
                  )}
                >
                  {slot.state === "filled" ? <Check aria-hidden className="h-3.5 w-3.5" /> : slot.state === "asked" ? <Clock aria-hidden className="h-3.5 w-3.5" /> : <CircleHelp aria-hidden className="h-3.5 w-3.5" />}
                  {slot.state === "filled" ? slot.filled : slot.state === "reading" ? "Read their reply" : slot.label}
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
