"use client";

import { formatINR } from "@/domain/money";
import type { EconomicsActivationPreview } from "@/lib/economics-activation";
import { Button } from "@/components/client";
import { describeInputChange, describeReevaluation } from "@/lib/reevaluation-copy";

export function ReviewPanel({ preview, pending, error, onActivate }: { preview: EconomicsActivationPreview; pending: boolean; error: string | null; onActivate: () => void }) {
  const errors = preview.issues.filter((issue) => issue.level === "error");
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5" data-testid="economics-review">
      <h2 className="text-[18px] font-semibold text-ink">Check before you save</h2>
      <p className="mt-1 text-[13px] text-ink-2">New deals will use these prices and costs once you save them.</p>
      {preview.unchanged ? <div className="mt-4 rounded-lg border border-line bg-surface-muted px-3 py-2 text-[13px] font-medium text-ink-2" data-testid="economics-unchanged">Nothing has changed yet. Change a price, cost or limit above, then check again.</div> : null}
      {preview.issues.length ? (
        <div className="mt-4 space-y-2">
          {preview.issues.map((issue, index) => (
            <div key={`${issue.field}-${index}`} data-testid={`economics-issue-${issue.field}`} className={`rounded-lg border px-3 py-2 text-[13px] ${issue.level === "error" ? "border-[#f6cfc9] bg-red-weak text-red" : "border-[#f7dfb4] bg-amber-weak text-amber"}`}>
              {issue.message}
            </div>
          ))}
        </div>
      ) : null}
      {preview.unreachableFloor ? <div className="mt-4 rounded-lg border border-[#f6cfc9] bg-red-weak px-3 py-2 text-[13px] font-semibold text-red" data-testid="economics-unreachable-floor">No offer can reach this profit, even at your standard prices. Lower it or raise your prices.</div> : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-[13px]">
          <thead><tr className="border-b border-line text-left text-[12px] uppercase tracking-wide text-muted"><th className="py-2">Service</th><th className="py-2 text-right">Price</th><th className="py-2 text-right">Cost</th><th className="py-2 text-right">You keep</th></tr></thead>
          <tbody>{preview.serviceEconomics.map((row) => <tr key={row.id} className="border-b border-line last:border-0"><td className="py-2 font-medium text-ink">{row.name}</td><td className="py-2 text-right">{formatINR(row.pricePaise)}</td><td className="py-2 text-right">{formatINR(row.costPaise)}</td><td className="py-2 text-right">{formatINR(row.contributionPaise)} <span className="text-muted">({Math.round(row.marginBps / 100)}%)</span></td></tr>)}</tbody>
        </table>
      </div>
      {preview.demoDeal ? (() => {
        const summary = describeReevaluation(preview.demoDeal);
        const names = preview.serviceEconomics.map((row) => row.name);
        return (
          <div className="mt-4 rounded-xl border border-[#d6defe] bg-blue-weak p-3 text-[13px] text-ink-2" data-testid="economics-demo-effect">
            <div className="font-semibold text-blue-ink">What this changes for your open deal</div>
            <p className="mt-1">{preview.demoDeal.pricesNote}</p>
            <p className="font-medium text-ink">{summary.headline}</p>
            {preview.demoDeal.inputChanges.length ? <ul className="mt-1 list-disc space-y-0.5 pl-5">{preview.demoDeal.inputChanges.map((c) => <li key={c.field}>{describeInputChange(c, names)}</li>)}</ul> : null}
            {summary.effects.length ? <ul className="mt-1 list-disc space-y-0.5 pl-5">{summary.effects.map((line) => <li key={line}>{line}</li>)}</ul> : null}
          </div>
        );
      })() : null}
      {error ? <p className="mt-3 text-[13px] text-red" role="alert">{error}</p> : null}
      <div className="mt-4">
        <Button variant="primary" data-testid="economics-activate" disabled={pending || preview.unchanged || errors.length > 0 || preview.unreachableFloor} onClick={onActivate}>{pending ? "Saving…" : "Save these prices & costs"}</Button>
      </div>
    </section>
  );
}
