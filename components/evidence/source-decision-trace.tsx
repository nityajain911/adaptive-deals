"use client";

import type { SourceTrace } from "@/lib/source-trace";

/**
 * A compact, accessible audit trail for a decision. It deliberately displays only provenance
 * that the server-side adapter has already verified.
 */
export function SourceDecisionTrace({ traces, title = "How this decision is grounded" }: { traces: SourceTrace[]; title?: string }) {
  if (!traces.length) return null;

  const focusSource = (sourceId: string) => {
    const target = document.getElementById(`source-${sourceId}`);
    target?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    target?.focus({ preventScroll: true });
  };

  return (
    <section className="rounded-xl border border-line bg-surface-muted p-4" aria-labelledby="source-decision-trace-title" data-testid="source-decision-trace">
      <h3 id="source-decision-trace-title" className="text-[15px] font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-[14px] leading-5 text-ink-2">Each row shows the source, what Adaptive Deals understood, and where it used that fact.</p>
      <ol className="mt-3 space-y-2">
        {traces.map((trace) => (
          <li key={trace.id} className="grid gap-2 rounded-lg border border-line bg-surface p-3 text-[14px] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]" data-testid={`source-trace-${trace.id}`}>
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Source</div>
              <p className="mt-1 text-[14px] font-semibold text-ink-2">{trace.sourceLabel}</p>
              <p className="mt-1 leading-5 text-ink">“{trace.quote}”</p>
              <button type="button" className="mt-1 text-[14px] font-semibold text-blue hover:underline" onClick={() => focusSource(trace.sourceId)}>
                View source
              </button>
            </div>
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Understood as</div>
              <p className="mt-1 leading-5 text-ink"><span className="font-semibold">{trace.derivedLabel}:</span> {trace.derivedValue}</p>
            </div>
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Used to</div>
              <p className="mt-1 leading-5 text-ink">{trace.usage}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
