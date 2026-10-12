"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EconomicsContent } from "@/domain/business-economics";
import type { EconomicsEvidenceDraft, EconomicsEvidenceProposal } from "@/commercial-memory/economics-draft";
import { formatINR } from "@/domain/money";
import { Button } from "@/components/client";
import { documentReview } from "@/lib/document-review";

export interface MemorySourceSummary {
  id: string;
  title: string;
  kind: string;
  status: string;
  effectiveFrom: string;
  access: string;
  uploaded?: boolean;
  fileName?: string | null;
  merchantId?: string;
}

const call = async (body: Record<string, unknown>) => {
  const response = await fetch("/api/commercial-memory/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json() as { ok: boolean; result?: unknown; error?: string };
  if (!json.ok) throw new Error(json.error ?? "Commercial Memory action failed");
  return json.result;
};


interface UploadSummary {
  sourceId: string;
  title: string;
  kind: string;
  alreadyStored: boolean;
  proposalCount: number;
  considered: number;
  notes: { line: string; reason: string }[];
  extractedText: string | null;
  reader?: { mode: "recorded" | "live" | "unavailable" | "failed"; label: string | null; proposed: number; rejected: number; message: string | null };
}

const toBase64 = (buffer: ArrayBuffer) => {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
const DEMO_DATE = "2026-10-08";
const inputClass = "mt-1 block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[14px] text-ink";

/** Add the merchant's own rate card or cost sheet: a CSV, pasted text, or a text-based PDF. A built-in reader and an AI reader propose values; code checks each against the document. */
function UploadDocument({ sources, open, onClose, onUploaded }: { sources: MemorySourceSummary[]; open: boolean; onClose: () => void; onUploaded: (result: UploadSummary) => void }) {
  const [kind, setKind] = useState<"rate_card" | "cost_sheet">("rate_card");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(DEMO_DATE);
  const [pasted, setPasted] = useState("");
  const [pastedFormat, setPastedFormat] = useState<"csv" | "text">("csv");
  const [replace, setReplace] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; notes: { line: string; reason: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  // Only this merchant's own active sample can be replaced; another merchant's sources are never offered.
  const sample = sources.find((source) => !source.uploaded && source.merchantId === "merchant-pinecone" && source.kind === kind && source.status === "active") ?? null;

  const submit = async () => {
    setPending(true); setError(null);
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
      setPasted("");
      setReplace(false);
      if (fileRef.current) fileRef.current.value = "";
      onUploaded(json.result!);
      onClose();
    } catch {
      setError({ message: "The upload failed", notes: [] });
    } finally {
      setPending(false);
    }
  };

  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby="upload-title" data-testid="memory-upload" className="m-auto max-h-[92vh] w-[min(36rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/40">
      <div className="space-y-3 p-5">
        <h2 id="upload-title" className="text-[18px] font-semibold text-ink">Bring in your rate card</h2>
        <p className="text-[13px] text-ink-2">CSV, text-based PDF or pasted text. Nothing changes until you confirm.</p>
        <p className="text-[13px] text-ink-2" data-testid="memory-upload-samples">Try a sample:{" "}
          <a className="font-semibold text-blue hover:underline" href="/sample-documents/pinecone-rate-card-oct-2026.pdf" download>rate card (PDF)</a>,{" "}
          <a className="font-semibold text-blue hover:underline" href="/sample-documents/pinecone-cost-sheet-oct-2026.pdf" download>cost sheet (PDF)</a> or{" "}
          <a className="font-semibold text-blue hover:underline" href="/sample-documents/pinecone-rate-card-oct-2026.csv" download>rate card (CSV)</a>.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-[13px] font-medium text-ink">This is a
            <select className={inputClass} value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setReplace(false); }} data-testid="memory-upload-kind">
              <option value="rate_card">Rate card</option>
              <option value="cost_sheet">Cost sheet</option>
            </select>
          </label>
          <label className="text-[13px] font-medium text-ink">Name
            <input className={inputClass} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Our 2026 rates" data-testid="memory-upload-title" />
          </label>
          <label className="text-[13px] font-medium text-ink">Valid from
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
            <span>Replace the sample “{sample.title}” with this one. Otherwise any difference between the two has to be sorted out first.</span>
          </label>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={pending} onClick={() => void submit()} data-testid="memory-upload-submit">{pending ? "Reading…" : "Add document"}</Button>
          <Button onClick={onClose} data-testid="memory-upload-skip">Skip, use the demo documents</Button>
        </div>
        {error ? (
          <div className="rounded-lg border border-[#f3c8c3] bg-red-weak px-3 py-2 text-[13px] text-red" role="alert" data-testid="memory-upload-error">
            <p className="font-medium">{error.message}</p>
            {error.notes.length ? <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px]" data-testid="memory-upload-error-notes">{error.notes.map((note, i) => <li key={i}><span className="font-mono">{note.line.slice(0, 80)}</span> · {note.reason}</li>)}</ul> : null}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}

/** What an upload found, shown on the page once the upload dialog has closed. */
function UploadResult({ result }: { result: UploadSummary }) {
  return (
          <div className="rounded-lg border border-[#c9e7d3] bg-green-weak px-3 py-2 text-[13px] text-ink" role="status" data-testid="memory-upload-result">
      <p className="font-medium">{result.alreadyStored ? "This document was already added." : "Added."} Found {result.proposalCount} {result.kind === "rate_card" ? "price" : "cost"}{result.proposalCount === 1 ? "" : "s"}{result.notes.length ? `; ${result.notes.length} line${result.notes.length === 1 ? "" : "s"} not used` : ""}.</p>
      {result.reader ? <p className="mt-1 text-[12px] text-ink-2" data-testid="memory-upload-reader">{result.reader.label ? `AI reading: ${result.reader.label}. It proposed ${result.reader.proposed} line${result.reader.proposed === 1 ? "" : "s"}; ${result.reader.rejected ? `${result.reader.rejected} did not pass the check against your document and ${result.reader.rejected === 1 ? "was" : "were"} dropped.` : "all passed the check against your document."}` : (result.reader.message ?? "")}</p> : null}
      {result.notes.length ? <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px] text-ink-2" data-testid="memory-upload-notes">{result.notes.map((note, i) => <li key={i}><span className="font-mono">{note.line.slice(0, 80)}</span> · {note.reason}</li>)}</ul> : null}
      {result.extractedText ? <details className="mt-2"><summary className="cursor-pointer text-[12px] font-semibold text-blue">What we read from the PDF</summary><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-surface p-2 text-[12px]" data-testid="memory-upload-read-text">{result.extractedText}</pre></details> : null}
    </div>
  );
}

const READER: Record<NonNullable<EconomicsEvidenceProposal["reader"]>, string> = { rules: "Line reader", ai: "AI, checked", both: "Line reader and AI agree" };

/** One found value: the service, what was found, what it is now, who read it, and the exact line it came from. */
function ProposalRow({ proposal, checked, onToggle }: { proposal: EconomicsEvidenceProposal; checked: boolean; onToggle: (on: boolean) => void }) {
  const same = proposal.currentValue === proposal.proposedValue;
  return (
    <div role="row" className="grid gap-x-3 gap-y-1 px-3 py-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-start" data-testid={`proposal-${proposal.id}`}>
      <label role="cell" className="flex items-start gap-3">
        <input className="mt-1" type="checkbox" checked={checked} disabled={proposal.status === "conflicting"} onChange={(event) => onToggle(event.target.checked)} />
        <span className="min-w-0"><span className="block text-[13px] font-semibold text-ink">{proposal.serviceName} · {proposal.field.endsWith("listPricePaise") ? "standard price" : "direct delivery cost"}</span><span className="block text-[12px] text-muted">from {proposal.sourceTitle}</span>{proposal.matchedAs ? <span className="mt-0.5 block text-[12px] text-amber" data-testid="alias-note">Your document says “{proposal.matchedAs}”. The AI matched it to {proposal.serviceName}. Check that is right.</span> : null}</span>
      </label>
      <div role="cell" className="text-[14px] font-semibold text-ink"><span className="text-[12px] font-normal text-muted sm:hidden">Found </span>{formatINR(proposal.proposedValue)}</div>
      <div role="cell" className="text-[13px] text-ink-2"><span className="text-[12px] text-muted sm:hidden">Now </span>{same ? "same as now" : formatINR(proposal.currentValue)}</div>
      <div role="cell" className="text-[12px] font-medium text-ink-2" data-testid="proposal-reader">{READER[proposal.reader ?? "rules"]}</div>
      <details className="sm:col-span-4 sm:ml-7"><summary className="cursor-pointer text-[12px] font-semibold text-blue" data-testid="memory-citation">Where this came from</summary><blockquote className="mt-2 border-l-2 border-blue pl-3 text-[13px] text-ink-2">{proposal.quote}</blockquote></details>
    </div>
  );
}

export function CommercialMemoryPanel({ sources, onApply, onEditorVisibilityChange }: { sources: MemorySourceSummary[]; onApply: (content: EconomicsContent) => void; onEditorVisibilityChange: (visible: boolean) => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState<EconomicsEvidenceDraft | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const review = documentReview({ sources, draft });

  const run = async (fn: () => Promise<void>) => {
    setPending(true); setError(null); setMessage(null);
    try { await fn(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Commercial Memory action failed"); }
    finally { setPending(false); }
  };

  const changed = (draft?.proposals ?? []).filter((proposal) => proposal.proposedValue !== proposal.currentValue || proposal.status === "conflicting");
  const unchanged = (draft?.proposals ?? []).filter((proposal) => proposal.proposedValue === proposal.currentValue && proposal.status !== "conflicting");
  const asked = changed.length ? changed : (draft?.proposals ?? []);
  const toggle = (id: string) => (on: boolean) => setSelected((current) => on ? [...current, id] : current.filter((item) => item !== id));
  const readDocuments = () => run(async () => {
    const result = await call({ action: "draft_economics_from_memory" }) as EconomicsEvidenceDraft;
    setDraft(result);
    setSelected(result.proposals.filter((proposal) => proposal.status === "supported").map((proposal) => proposal.id));
    onEditorVisibilityChange(false);
  });

  const uploads = sources.filter((source) => source.uploaded && source.status === "active");
  const synced = uploads.length > 0;
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadSummary | null>(null);

  return (
    <section className="space-y-3" data-testid="commercial-memory">
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-2.5 text-[14px] ${synced ? "bg-green-weak text-green" : "border border-line bg-surface text-ink-2"}`} data-testid="document-source">
        <span aria-hidden className={`h-2 w-2 rounded-full ${synced ? "bg-green" : "bg-line-strong"}`} />
        <span className="min-w-0 flex-1 font-medium" data-testid="document-default-message">{synced ? `Synced with ${uploads.map((source) => source.title).join(" and ")}` : `Using the ${review.activeDocuments.length} demo documents`}</span>
        <button type="button" className="font-semibold text-blue hover:underline" onClick={() => setUploadOpen(true)} data-testid="memory-upload-toggle">{synced ? "Update source" : "Upload your rate card"}</button>
        <button type="button" className="text-[13px] font-medium text-ink-2 hover:underline disabled:opacity-60" disabled={pending} onClick={() => void readDocuments()} data-testid="memory-draft">{pending ? "Reading…" : "Review values from documents"}</button>
      </div>

      {review.manageableDocuments.length ? <details className="rounded-xl border border-line bg-surface-muted px-3 py-2">
        <summary className="cursor-pointer text-[13px] font-semibold text-ink">Document history</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {review.manageableDocuments.map((source) => <div key={source.id} className="rounded-lg border border-line bg-surface px-3 py-2"><div className="flex items-start justify-between gap-3"><div><div className="text-[13px] font-medium text-ink">{source.title}</div><div className="mt-0.5 text-[12px] capitalize text-muted">{source.uploaded ? "Uploaded by you" : "Sample document"} · {source.status === "superseded" ? "replaced" : source.status}</div></div>{source.uploaded && source.status === "active" ? <Button className="shrink-0" data-testid={`memory-withdraw-${source.id}`} disabled={pending} onClick={() => void run(async () => { await call({ action: "withdraw_memory_source", sourceId: source.id }); setDraft(null); router.refresh(); })}>Remove</Button> : null}</div></div>)}
        </div>
      </details> : null}

      <UploadDocument sources={sources} open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={(result) => { setUploadResult(result); setDraft(null); router.refresh(); void readDocuments(); }} />
      {uploadResult ? <UploadResult result={uploadResult} /> : null}

      {draft ? <div className="space-y-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5" data-testid="memory-proposals">
        <div>
          <h3 className="text-[16px] font-semibold text-ink">Review what we found</h3>
          {review.message ? <p className="text-[13px] font-medium text-ink" data-testid="review-summary">{review.message}</p> : null}
          <p className="text-[14px] text-ink-2" data-testid="review-question">{draft.proposals.length ? `Do these ${asked.every((proposal) => proposal.field.endsWith("directCostPaise")) ? "costs" : asked.every((proposal) => proposal.field.endsWith("listPricePaise")) ? "prices" : "prices and costs"} look correct?` : "Nothing in your documents could be read as a price or cost."}</p>
          <p className="mt-1 text-[12px] text-muted" data-testid="review-readers">{draft.readers?.length ? `Read by the built-in line reader and an AI reader (${[...new Set(draft.readers.map((reader) => reader.label))].join(", ")}). Code checked every value against your document.` : "Read by the built-in line reader, not AI. Code checked every value against your document."}</p>
        </div>
        {draft.status === "conflicting_evidence" ? <p className="rounded-lg border border-[#f7dfb4] bg-amber-weak px-3 py-2 text-[13px] text-amber">Two of your documents give different numbers for the same thing. Remove or replace one, then try again.</p> : null}
        {draft.notes?.length ? <details className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-[13px]" data-testid="memory-draft-notes"><summary className="cursor-pointer font-semibold text-ink">{draft.notes.length} line{draft.notes.length === 1 ? "" : "s"} in your documents not used</summary><ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px] text-ink-2">{draft.notes.map((note, i) => <li key={i}><span className="font-mono">{note.line.slice(0, 80)}</span> · {note.reason} ({note.sourceTitle})</li>)}</ul></details> : null}
        <div className="overflow-hidden rounded-xl border border-line" role="table" aria-label="Values found in your documents">
          <div role="row" className="hidden gap-3 border-b border-line bg-surface-muted px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-muted sm:grid sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"><span role="columnheader">Service</span><span role="columnheader">Found</span><span role="columnheader">Now</span><span role="columnheader">Read by</span></div>
          <div className="divide-y divide-line">
            {changed.map((proposal) => <ProposalRow key={proposal.id} proposal={proposal} checked={selected.includes(proposal.id)} onToggle={toggle(proposal.id)} />)}
          </div>
          {unchanged.length ? <details open={changed.length === 0} className="border-t border-line" data-testid="review-unchanged"><summary className="cursor-pointer bg-surface-muted px-3 py-2 text-[13px] font-semibold text-ink">{unchanged.length} value{unchanged.length === 1 ? "" : "s"} already match your saved prices and costs</summary><div className="divide-y divide-line">{unchanged.map((proposal) => <ProposalRow key={proposal.id} proposal={proposal} checked={selected.includes(proposal.id)} onToggle={toggle(proposal.id)} />)}</div></details> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1"><Button variant="primary" data-testid="memory-apply" disabled={pending || selected.length === 0} onClick={() => void run(async () => {
          const result = await call({ action: "confirm_economics_from_memory", draftId: draft.id, proposalIds: selected }) as { content: EconomicsContent; confirmed: number };
          onApply(result.content); onEditorVisibilityChange(true); setMessage(`${result.confirmed} values added below. Check them, then save.`);
        })}>{pending ? "Adding…" : `Looks right, use these ${selected.length} values`}</Button><Button data-testid="memory-edit-instead" disabled={pending} onClick={() => { setDraft(null); onEditorVisibilityChange(true); }}>Edit by hand instead</Button></div>
      </div> : null}
      {message ? <p className="mt-3 text-[13px] font-medium text-green" role="status">{message}</p> : null}
      {error ? <p className="mt-3 text-[13px] text-red" role="alert">{error}</p> : null}
    </section>
  );
}
