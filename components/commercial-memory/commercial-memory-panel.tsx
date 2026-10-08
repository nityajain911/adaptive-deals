"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  uploaded?: boolean;
  fileName?: string | null;
}

const call = async (body: Record<string, unknown>) => {
  const response = await fetch("/api/commercial-memory/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json() as { ok: boolean; result?: unknown; error?: string };
  if (!json.ok) throw new Error(json.error ?? "Commercial Memory action failed");
  return json.result;
};

const kindLabel = (kind: string) => kind.replaceAll("_", " ");

interface UploadSummary {
  sourceId: string;
  title: string;
  kind: string;
  alreadyStored: boolean;
  proposalCount: number;
  considered: number;
  notes: { line: string; reason: string }[];
  extractedText: string | null;
}

const toBase64 = (buffer: ArrayBuffer) => {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
const DEMO_DATE = "2026-10-08";
const inputClass = "mt-1 block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[14px] text-ink";

/** Add the merchant's own rate card or cost sheet: a CSV, pasted text, or a text-based PDF. It stays on this computer and no model reads it. */
function UploadDocument({ sources, onUploaded }: { sources: MemorySourceSummary[]; onUploaded: () => void }) {
  const [kind, setKind] = useState<"rate_card" | "cost_sheet">("rate_card");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(DEMO_DATE);
  const [pasted, setPasted] = useState("");
  const [pastedFormat, setPastedFormat] = useState<"csv" | "text">("csv");
  const [replace, setReplace] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; notes: { line: string; reason: string }[] } | null>(null);
  const [result, setResult] = useState<UploadSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sample = sources.find((source) => !source.uploaded && source.kind === kind && source.status === "active") ?? null;

  const submit = async () => {
    setPending(true); setError(null); setResult(null);
    try {
      const file = fileRef.current?.files?.[0] ?? null;
      const name = file?.name ?? null;
      const lower = name?.toLowerCase() ?? "";
      const base: Record<string, unknown> = { action: "upload_memory_source", title: title.trim() || (name ?? (kind === "rate_card" ? "My rate card" : "My cost sheet")), kind, effectiveFrom: date, fileName: name, supersedes: replace && sample ? sample.id : null };
      if (file && lower.endsWith(".pdf")) Object.assign(base, { format: "pdf", pdfBase64: toBase64(await file.arrayBuffer()) });
      else if (file) Object.assign(base, { format: lower.endsWith(".csv") ? "csv" : "text", text: await file.text() });
      else Object.assign(base, { format: pastedFormat, text: pasted });
      const response = await fetch("/api/commercial-memory/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(base) });
      const json = await response.json() as { ok: boolean; result?: UploadSummary; error?: string; notes?: { line: string; reason: string }[] };
      if (!json.ok) { setError({ message: json.error ?? "The upload failed", notes: json.notes ?? [] }); return; }
      setResult(json.result!);
      setPasted("");
      if (fileRef.current) fileRef.current.value = "";
      onUploaded();
    } catch {
      setError({ message: "The upload failed", notes: [] });
    } finally {
      setPending(false);
    }
  };

  return (
    <details className="mt-4 rounded-xl border border-line bg-surface-muted px-3 py-2" data-testid="memory-upload">
      <summary className="cursor-pointer text-[13px] font-semibold text-ink" data-testid="memory-upload-toggle">Add your own rate card or cost sheet</summary>
      <div className="mt-3 space-y-3 pb-2">
        <p className="text-[13px] text-ink-2">Upload a CSV or a text-based PDF, or paste text. Each line should name one of your services and give one amount. The file stays on this computer and no AI model reads it. Scanned PDFs, Excel files and images are not supported.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-[13px] font-medium text-ink">This document is a
            <select className={inputClass} value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setReplace(false); }} data-testid="memory-upload-kind">
              <option value="rate_card">Rate card (prices)</option>
              <option value="cost_sheet">Cost sheet (delivery costs)</option>
            </select>
          </label>
          <label className="text-[13px] font-medium text-ink">Name
            <input className={inputClass} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Our 2026 rates" data-testid="memory-upload-title" />
          </label>
          <label className="text-[13px] font-medium text-ink">In effect from
            <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} data-testid="memory-upload-date" />
          </label>
        </div>
        <label className="block text-[13px] font-medium text-ink">File (.csv, .txt or .pdf)
          <input ref={fileRef} type="file" accept=".csv,.txt,.pdf,text/csv,text/plain,application/pdf" className="mt-1 block text-[13px]" data-testid="memory-upload-file" />
        </label>
        <div>
          <div className="flex items-center justify-between gap-2 text-[13px] font-medium text-ink">
            <label htmlFor="memory-upload-text">…or paste it here</label>
            <select className="rounded-md border border-line-strong bg-surface px-2 py-1 text-[12px]" value={pastedFormat} onChange={(e) => setPastedFormat(e.target.value as typeof pastedFormat)} aria-label="Format of the pasted text" data-testid="memory-upload-format">
              <option value="csv">CSV</option>
              <option value="text">Plain text</option>
            </select>
          </div>
          <textarea id="memory-upload-text" className={`${inputClass} min-h-24 font-mono text-[12px]`} value={pasted} maxLength={40000} onChange={(e) => setPasted(e.target.value)} placeholder={"Service,Price\nWebsite fixes,26000"} data-testid="memory-upload-text" />
        </div>
        {sample ? (
          <label className="flex items-start gap-2 text-[13px] text-ink">
            <input type="checkbox" className="mt-0.5" checked={replace} onChange={(e) => setReplace(e.target.checked)} data-testid="memory-upload-replace" />
            <span>Use this instead of the sample “{sample.title}”. Otherwise any difference between the two is a conflict you must resolve.</span>
          </label>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={pending} onClick={() => void submit()} data-testid="memory-upload-submit">{pending ? "Reading…" : "Add document"}</Button>
          <span className="text-[12px] text-muted">Nothing changes in your economics until you review and activate it.</span>
        </div>
        {error ? (
          <div className="rounded-lg border border-[#f3c8c3] bg-red-weak px-3 py-2 text-[13px] text-red" role="alert" data-testid="memory-upload-error">
            <p className="font-medium">{error.message}</p>
            {error.notes.length ? <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px]" data-testid="memory-upload-error-notes">{error.notes.map((note, i) => <li key={i}><span className="font-mono">{note.line.slice(0, 80)}</span> · {note.reason}</li>)}</ul> : null}
          </div>
        ) : null}
        {result ? (
          <div className="rounded-lg border border-[#c9e7d3] bg-green-weak px-3 py-2 text-[13px] text-ink" role="status" data-testid="memory-upload-result">
            <p className="font-medium">{result.alreadyStored ? "This document was already added." : "Added."} Found {result.proposalCount} {result.kind === "rate_card" ? "price" : "cost"}{result.proposalCount === 1 ? "" : "s"}{result.notes.length ? `; ${result.notes.length} line${result.notes.length === 1 ? "" : "s"} not used` : ""}. Select <strong>Draft economics from evidence</strong> to review them.</p>
            {result.notes.length ? <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px] text-ink-2" data-testid="memory-upload-notes">{result.notes.map((note, i) => <li key={i}><span className="font-mono">{note.line.slice(0, 80)}</span> · {note.reason}</li>)}</ul> : null}
            {result.extractedText ? <details className="mt-2"><summary className="cursor-pointer text-[12px] font-semibold text-blue">What we read from the PDF</summary><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-surface p-2 text-[12px]" data-testid="memory-upload-read-text">{result.extractedText}</pre></details> : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}

export function CommercialMemoryPanel({ sources, onApply }: { sources: MemorySourceSummary[]; onApply: (content: EconomicsContent) => void }) {
  const router = useRouter();
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
          {sources.map((source) => <div key={source.id} className="rounded-lg border border-line bg-surface px-3 py-2"><div className="text-[13px] font-medium text-ink">{source.title}</div><div className="mt-0.5 text-[12px] capitalize text-muted">{kindLabel(source.kind)} · {source.status} · from {source.effectiveFrom}{source.uploaded ? " · uploaded" : ""}</div>{source.uploaded && source.status === "active" ? <button type="button" className="mt-1 text-[12px] font-semibold text-red hover:underline" data-testid={`memory-withdraw-${source.id}`} disabled={pending} onClick={() => void run(async () => { await call({ action: "withdraw_memory_source", sourceId: source.id }); setDraft(null); router.refresh(); })}>Withdraw</button> : null}</div>)}
        </div>
      </details>

      <UploadDocument sources={sources} onUploaded={() => { setDraft(null); router.refresh(); }} />

      {draft ? <div className="mt-4 space-y-2" data-testid="memory-proposals">
        <div className="flex items-center justify-between gap-3"><h3 className="text-[15px] font-semibold text-ink">Review suggested values</h3><span className="text-[12px] text-muted">Ranked by code · exact source citations</span></div>
        {draft.status === "conflicting_evidence" ? <p className="rounded-lg border border-[#f7dfb4] bg-amber-weak px-3 py-2 text-[13px] text-amber">Some active sources disagree. Conflicting values cannot be confirmed.</p> : null}
        {draft.notes?.length ? <details className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-[13px]" data-testid="memory-draft-notes"><summary className="cursor-pointer font-semibold text-ink">{draft.notes.length} line{draft.notes.length === 1 ? "" : "s"} in your documents not used</summary><ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px] text-ink-2">{draft.notes.map((note, i) => <li key={i}><span className="font-mono">{note.line.slice(0, 80)}</span> · {note.reason} ({note.sourceTitle})</li>)}</ul></details> : null}
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
