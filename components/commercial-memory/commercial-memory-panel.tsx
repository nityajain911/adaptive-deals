"use client";

import { useState } from "react";
import type { EconomicsContent } from "@/domain/business-economics";
import type { EconomicsEvidenceDraft } from "@/commercial-memory/economics-draft";
import { formatINR } from "@/domain/money";
import { Button } from "@/components/client";

export interface MemorySourceSummary {
  id: string;
  title: string;
  kind: string;
  status: string;
  effectiveFrom: string;
  access: string;
}

const call = async (body: Record<string, unknown>) => {
  const response = await fetch("/api/commercial-memory/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json() as { ok: boolean; result?: unknown; error?: string };
  if (!json.ok) throw new Error(json.error ?? "Commercial Memory action failed");
  return json.result;
};

const kindLabel = (kind: string) => kind.replaceAll("_", " ");

export function CommercialMemoryPanel({ sources, onApply }: { sources: MemorySourceSummary[]; onApply: (content: EconomicsContent) => void }) {
  const [draft, setDraft] = useState<EconomicsEvidenceDraft | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setPending(true); setError(null); setMessage(null);
    try { await fn(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Commercial Memory action failed"); }
    finally { setPending(false); }
  };

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5" data-testid="commercial-memory">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold text-ink">Commercial Memory</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-ink-2">Use your rate cards and cost records to prepare evidence-backed values. Nothing changes until you review and activate them.</p>
          <p className="mt-2 text-[13px] font-semibold text-blue-ink">{sources.length} connected sources</p>
        </div>
        <Button variant="primary" data-testid="memory-draft" disabled={pending} onClick={() => void run(async () => {
          const result = await call({ action: "draft_economics_from_memory" }) as EconomicsEvidenceDraft;
          setDraft(result);
          setSelected(result.proposals.filter((proposal) => proposal.status === "supported").map((proposal) => proposal.id));
        })}>{pending ? "Reading sources…" : "Draft economics from evidence"}</Button>
      </div>

      <details className="mt-4 rounded-xl border border-line bg-surface-muted px-3 py-2">
        <summary className="cursor-pointer text-[13px] font-semibold text-ink">Connected evidence</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {sources.map((source) => <div key={source.id} className="rounded-lg border border-line bg-surface px-3 py-2"><div className="text-[13px] font-medium text-ink">{source.title}</div><div className="mt-0.5 text-[12px] capitalize text-muted">{kindLabel(source.kind)} · {source.status} · from {source.effectiveFrom}</div></div>)}
        </div>
      </details>

      {draft ? <div className="mt-4 space-y-2" data-testid="memory-proposals">
        <div className="flex items-center justify-between gap-3"><h3 className="text-[15px] font-semibold text-ink">Review suggested values</h3><span className="text-[12px] text-muted">Ranked by code · exact source citations</span></div>
        {draft.status === "conflicting_evidence" ? <p className="rounded-lg border border-[#f7dfb4] bg-amber-weak px-3 py-2 text-[13px] text-amber">Some active sources disagree. Conflicting values cannot be confirmed.</p> : null}
        {draft.proposals.map((proposal) => <div key={proposal.id} className="rounded-xl border border-line px-3 py-3">
          <label className="flex items-start gap-3">
            <input className="mt-1" type="checkbox" checked={selected.includes(proposal.id)} disabled={proposal.status === "conflicting"} onChange={(event) => setSelected((current) => event.target.checked ? [...current, proposal.id] : current.filter((id) => id !== proposal.id))} />
            <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-ink">{proposal.serviceName} · {proposal.field.endsWith("listPricePaise") ? "standard price" : "direct delivery cost"}</span><span className="block text-[13px] text-ink-2">{formatINR(proposal.proposedValue)} from {proposal.sourceTitle}{proposal.currentValue === proposal.proposedValue ? " · matches the active value" : ` · currently ${formatINR(proposal.currentValue)}`}</span></span>
          </label>
          <details className="ml-7 mt-2"><summary className="cursor-pointer text-[12px] font-semibold text-blue" data-testid="memory-citation">See exact evidence</summary><blockquote className="mt-2 border-l-2 border-blue pl-3 text-[13px] text-ink-2">{proposal.quote}</blockquote></details>
        </div>)}
        <div className="flex flex-wrap items-center gap-3 pt-2"><Button variant="primary" data-testid="memory-apply" disabled={pending || selected.length === 0} onClick={() => void run(async () => {
          const result = await call({ action: "confirm_economics_from_memory", draftId: draft.id, proposalIds: selected }) as { content: EconomicsContent; confirmed: number };
          onApply(result.content); setMessage(`${result.confirmed} values copied into your draft. Review changes below before activation.`);
        })}>{pending ? "Applying…" : `Use ${selected.length} selected values`}</Button><span className="text-[12px] text-muted">This prepares a draft; it does not activate it.</span></div>
      </div> : null}
      {message ? <p className="mt-3 text-[13px] font-medium text-green" role="status">{message}</p> : null}
      {error ? <p className="mt-3 text-[13px] text-red" role="alert">{error}</p> : null}
    </section>
  );
}
