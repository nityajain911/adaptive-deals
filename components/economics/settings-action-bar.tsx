"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/client";

export type SettingsBarState = "saved" | "unsaved" | "checked";

/**
 * The one next step for this page, kept at the bottom of the screen wherever the merchant is: check what changed, save it
 * (and carry straight on to a deal), or, when nothing is pending, go to Active deals. It replaces the scattered
 * buttons so there is always exactly one obvious way forward.
 */
export function SettingsActionBar({
  state,
  version,
  pending,
  canSave,
  onCheck,
  onSave,
  onSaveAndStart,
}: {
  state: SettingsBarState;
  version: number;
  pending: boolean;
  canSave: boolean;
  onCheck: () => void;
  onSave: () => void;
  onSaveAndStart: () => void;
}) {
  return (
    <div className="settings-action-bar sticky bottom-0 z-20 -mx-3 border-t border-line bg-surface/95 px-3 py-3 backdrop-blur sm:-mx-6 sm:px-6" data-testid="settings-action-bar" data-state={state} role="region" aria-label="Next step">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-end gap-x-3 gap-y-2">
        <p className="w-full min-w-0 text-[13px] text-ink-2 sm:w-auto sm:flex-1 sm:text-right" data-testid="economics-current" role="status">
          {state === "saved" ? `Saved as version ${version}` : state === "unsaved" ? "Unsaved changes" : "Ready to save"}
        </p>
        {state === "saved" ? (
          <Link href="/deals" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue px-5 text-[15px] font-semibold text-white hover:bg-blue-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue" data-testid="settings-go-deals">
            Go to Active deals <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        ) : state === "unsaved" ? (
          <Button variant="primary" className="min-h-11 px-5 text-[15px]" data-testid="economics-review-button" disabled={pending} onClick={onCheck}>{pending ? "Checking…" : "Check my changes"}</Button>
        ) : (
          <>
            <Button className="min-h-11" data-testid="economics-activate" disabled={!canSave} onClick={onSave}>{pending ? "Saving…" : "Save only"}</Button>
            <Button variant="primary" className="min-h-11 px-5 text-[15px]" data-testid="economics-activate-and-start" disabled={!canSave} onClick={onSaveAndStart}>{pending ? "Saving…" : "Save & start a deal"} <ArrowRight aria-hidden className="h-4 w-4" /></Button>
          </>
        )}
      </div>
    </div>
  );
}
