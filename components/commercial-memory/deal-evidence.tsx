import type { CommercialMemoryDealView } from "@/lib/commercial-memory-view";

export function RelevantHistory({ memory }: { memory: CommercialMemoryDealView }) {
  if (!memory.history) return null;
  return (
    <details className="rounded-xl border border-line bg-surface px-4 py-3" data-testid="relevant-history">
      <summary className="cursor-pointer text-[14px] font-semibold text-ink">Past dealings with this buyer</summary>
      <p className="mt-2 text-[13px] leading-5 text-ink-2">From {memory.history.effectiveFrom}: “{memory.history.quote}”</p>
      <p className="mt-1 text-[12px] text-muted">From {memory.history.sourceTitle}. This is history, not something they have agreed to now.</p>
    </details>
  );
}

export function RecommendationEvidence({ buyerQuote, memory, engineFacts }: { buyerQuote: string | null; memory: CommercialMemoryDealView; engineFacts: string[] }) {
  return (
    <details className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]" data-testid="recommendation-evidence">
      <summary className="cursor-pointer text-[15px] font-semibold text-ink">Evidence behind this recommendation</summary>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section><h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Buyer said</h3><p className="mt-1 text-[13px] leading-5 text-ink-2">{buyerQuote ? `“${buyerQuote}”` : "No buyer quote supports this decision."}</p></section>
        <section><h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Your business records say</h3><ul className="mt-1 space-y-2 text-[13px] text-ink-2">{memory.merchantEvidence.map((item) => <li key={`${item.serviceId}-${item.kind}`}><span className="font-medium text-ink">{item.serviceName} · {item.kind === "price" ? "price" : "cost"}</span><br />“{item.quote}”<br /><span className="text-[12px] text-muted">{item.sourceTitle} · from {item.effectiveFrom}</span></li>)}</ul></section>
        <section><h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted">The engine checked</h3><ul className="mt-1 list-disc space-y-1 pl-4 text-[13px] text-ink-2">{engineFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul></section>
      </div>
      <p className="mt-3 text-[12px] text-muted">Evidence retrieved and ranked by code. All commercial figures and pass/fail decisions are calculated by the engine.</p>
    </details>
  );
}
