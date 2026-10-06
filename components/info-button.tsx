"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";

/**
 * A small "i" that opens a short note on click or keypress (not on hover, so it works on touch).
 * Esc or a click elsewhere closes it. The note is not rendered while closed.
 */
export function InfoButton({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <span ref={root} className="relative inline-flex align-middle">
      <button type="button" aria-label={label} aria-expanded={open} aria-controls={open ? id : undefined} data-testid={testId} onClick={() => setOpen(!open)} className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-surface-muted hover:text-ink">
        <Info aria-hidden className="h-4 w-4" />
      </button>
      {open ? (
        <span id={id} role="note" className="absolute left-0 top-7 z-20 w-72 max-w-[80vw] rounded-lg border border-line bg-surface p-3 text-left text-[13px] font-normal normal-case leading-5 tracking-normal text-ink-2 shadow-lg" data-testid={testId ? `${testId}-note` : undefined}>
          {children}
        </span>
      ) : null}
    </span>
  );
}
