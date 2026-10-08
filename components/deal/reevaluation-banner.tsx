"use client";

import { useState } from "react";
import { Button, ErrorText, useAction } from "@/components/client";
import type { ReevaluationPreview } from "@/lib/reevaluation";
import { describeInputChange, describeReevaluation } from "@/lib/reevaluation-copy";

export function ReevaluationBanner({ preview, serviceNames }: { preview: ReevaluationPreview; serviceNames: string[] }) {
  const [open, setOpen] = useState(false);
  const summary = describeReevaluation(preview);
  const action = useAction();
  return (
    <section className="mt-4 rounded-xl border border-[#f7dfb4] bg-amber-weak p-4" data-testid="reevaluate-banner">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="font-semibold text-amber">Your prices & costs have changed since this offer was worked out.</div><p className="mt-1 text-[13px] text-ink-2">The prices quoted to this buyer stay unchanged. Review what the new costs and guardrails would change.</p></div>
        <Button data-testid="reevaluate-review" onClick={() => setOpen((value) => !value)}>{open ? "Hide review" : "Review the change"}</Button>
      </div>
      {open ? (
        <div className="mt-3 border-t border-[#ead5aa] pt-3 text-[13px] text-ink-2">
          <p className="font-medium text-ink">{summary.headline}</p>
          {preview.inputChanges.length ? <ul className="mt-1 list-disc space-y-0.5 pl-5" data-testid="reevaluate-changes">{preview.inputChanges.map((c) => <li key={c.field}>{describeInputChange(c, serviceNames)}</li>)}</ul> : null}
          <p className="mt-2">{preview.pricesNote}</p>
          {summary.effects.length ? <ul className="mt-1 list-disc space-y-0.5 pl-5" data-testid="reevaluate-effects">{summary.effects.map((line) => <li key={line}>{line}</li>)}</ul> : null}
          {preview.blocked.length ? <ul className="mt-2 list-disc pl-5">{preview.blocked.map((item) => <li key={item}>{item}</li>)}</ul> : null}
          <div className="mt-3"><Button variant="primary" data-testid="reevaluate-confirm" disabled={action.pending || preview.blocked.length > 0 || !preview.changesInputs} onClick={() => action.run({ action: "reevaluate_deal", toVersion: preview.toVersion })}>{action.pending ? "Re-evaluating…" : `Re-evaluate with version ${preview.toVersion}`}</Button></div>
          <ErrorText error={action.error} />
        </div>
      ) : null}
    </section>
  );
}
