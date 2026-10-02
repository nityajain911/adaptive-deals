"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "../client";

const OPEN = "adaptive-deals:open-audit";

/** Opens the audit drawer, optionally at a section (evidence, rules, history, economics, who, schedules). */
export function OpenAudit({ section = "evidence", children, testId, primary = false }: { section?: string; children: ReactNode; testId?: string; primary?: boolean }) {
  return primary ? (
    <Button variant="primary" className="min-h-10 px-4 text-[14px]" data-testid={testId ?? "primary-action"} onClick={() => window.dispatchEvent(new CustomEvent(OPEN, { detail: section }))}>
      {children}
    </Button>
  ) : (
    <button type="button" className="font-semibold text-blue underline-offset-2 hover:underline" data-testid={testId} onClick={() => window.dispatchEvent(new CustomEvent(OPEN, { detail: section }))}>
      {children}
    </button>
  );
}

/**
 * Read-only, deal-scoped audit drawer on the native modal dialog: focus is trapped while open,
 * Escape closes it and focus returns to the control that opened it. Full screen on phones.
 */
export function AuditDrawer({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = ref.current;
      if (!d) return;
      if (!d.open) d.showModal();
      const section = (e as CustomEvent<string>).detail;
      d.querySelector<HTMLElement>(`#audit-${section}`)?.scrollIntoView({ block: "start" });
    };
    window.addEventListener(OPEN, onOpen);
    return () => window.removeEventListener(OPEN, onOpen);
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="audit-title"
      data-testid="audit-drawer"
      className="audit-drawer m-0 ml-auto h-full max-h-none w-full max-w-[560px] border-l border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/30"
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-3">
        <h2 id="audit-title" className="text-[16px] font-semibold">
          Audit details · read-only
        </h2>
        <Button variant="ghost" onClick={() => ref.current?.close()} aria-label="Close audit details" data-testid="audit-close">
          Close
        </Button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}
