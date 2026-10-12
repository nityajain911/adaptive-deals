"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Eye, X } from "lucide-react";

/**
 * The buyer's page, in a sheet over the send screen: what the buyer will see, without taking the merchant off the screen
 * where Send is. Closes on Escape, the close button or the backdrop, and returns focus to the button that opened it.
 */
export function BuyerViewSheet({ buyerName, children }: { buyerName: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const trigger = opener.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button type="button" ref={opener} onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-surface-muted" data-testid="preview-buyer-view">
        <Eye aria-hidden className="h-4 w-4" /> Preview buyer view
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setOpen(false)} data-testid="buyer-view-backdrop">
          <div role="dialog" aria-modal="true" aria-label="Buyer view" className="flex h-full w-[92%] flex-col border-l border-line-strong bg-surface shadow-xl sm:w-[58%] sm:max-w-[640px]" onClick={(event) => event.stopPropagation()} data-testid="buyer-view-sheet">
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3">
              <div>
                <div className="text-[15px] font-semibold text-ink">Buyer view</div>
                <div className="text-[13px] text-ink-2">What {buyerName} will see · not sent</div>
              </div>
              <button type="button" ref={close} onClick={() => setOpen(false)} aria-label="Close buyer view" className="rounded-full p-1.5 text-muted hover:bg-surface-muted hover:text-ink" data-testid="buyer-view-close">
                <X aria-hidden className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4" data-testid="preview-frame-buyer">{children}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
