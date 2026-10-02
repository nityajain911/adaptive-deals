"use client";

import { useState } from "react";
import { Button, ErrorText, useAction } from "../client";
import { MERCHANT_CLOSE_REASONS, type MerchantCloseReason } from "@/lib/deal-records";
import { cx } from "../ui";

const TITLES = {
  dont_proceed: "Don't proceed",
  no_feasible: "Close in Adaptive Deals",
  outside: "Mark as handled outside Adaptive Deals",
} as const;
const DEFAULTS: Record<keyof typeof TITLES, MerchantCloseReason | ""> = { dont_proceed: "", no_feasible: "contribution_too_low", outside: "handled_elsewhere" };

/**
 * Merchant closure from the Offer stage, with a stable reason code and an optional note (spec §5.7).
 * As a primary action (no-feasible, outside templates) it is the stage's single primary button.
 */
export function DontProceed({ variant = "dont_proceed", primary = false }: { variant?: keyof typeof TITLES; primary?: boolean }) {
  const { run, pending, error } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<MerchantCloseReason | "">(DEFAULTS[variant]);
  const [note, setNote] = useState("");
  if (!open)
    return (
      <Button variant={primary ? "primary" : "ghost"} className={primary ? "min-h-10 px-4 text-[14px]" : ""} data-testid={primary ? "primary-action" : "dont-proceed"} onClick={() => setOpen(true)} aria-expanded={false}>
        {TITLES[variant]}
      </Button>
    );
  return (
    <form
      role="group"
      aria-label={TITLES[variant]}
      className="w-full space-y-3 rounded-xl border border-line bg-surface p-4"
      data-testid="close-sheet"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason) run({ action: "close_by_merchant", reason, note: note.trim() || undefined });
      }}
    >
      <div className="text-[14px] font-semibold text-ink">{TITLES[variant]}: why?</div>
      <fieldset className="grid gap-1.5 sm:grid-cols-2">
        <legend className="sr-only">Reason</legend>
        {(Object.entries(MERCHANT_CLOSE_REASONS) as [MerchantCloseReason, string][]).map(([code, label]) => (
          <label key={code} className={cx("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px]", reason === code ? "border-blue bg-blue-weak" : "border-line")}>
            <input type="radio" name="close-reason" value={code} checked={reason === code} onChange={() => setReason(code)} />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="block text-[12px] font-medium text-muted">
        Note (optional)
        <input className="mt-1 block w-full rounded-lg border border-line-strong px-3 py-2 text-[13px] text-ink" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </label>
      <p className="text-[12px] text-muted">Closes this deal in Adaptive Deals. Nothing is sent to the buyer, and every record is kept.</p>
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending || !reason} data-testid="confirm-close">
          {pending ? "Closing…" : "Confirm"}
        </Button>
        <Button type="button" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
      <ErrorText error={error} />
    </form>
  );
}
