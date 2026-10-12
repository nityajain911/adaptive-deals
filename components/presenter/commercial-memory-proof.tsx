"use client";

import { useState } from "react";
import { Button } from "@/components/client";

type Candidate = { chunkId: string; sourceId: string; sourceTitle: string; effectiveFrom: string; access: string; quote: string; relevance: string | null };
type QueryResult = { status: "found" | "insufficient_evidence"; attribution: "live_ai" | "recorded_ai" | "code"; note: string; candidates: Candidate[] };
type ConflictResult = { status: "conflicting_evidence"; simulated: true; field: string; values: { value: string; claimIds: string[] }[] };

const post = async (body: Record<string, unknown>) => {
  const response = await fetch("/api/commercial-memory/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json() as { ok: boolean; result?: unknown; error?: string };
  if (!json.ok) throw new Error(json.error ?? "Commercial Memory proof failed");
  return json.result;
};

const EXAMPLES = ["Can monthly reporting be sold by itself?", "What is our discount policy?", "Did Harbour Fresh buy website work before?", "Which services depend on search marketing?"];
const UNSUPPORTED = "What is our office electricity bill?";

/** A short, plain message for a failed request; the raw error is never shown. */
const friendly = () => "That did not work just now. Code retrieval from the saved documents is still available: try the question again.";

const attribution = (result: QueryResult) => result.attribution === "live_ai" ? "Live AI rerank" : result.attribution === "recorded_ai" ? "Recorded AI rerank" : "Code retrieval";

export function CommercialMemoryProof({ liveAvailable }: { liveAvailable: boolean }) {
  const [query, setQuery] = useState("Can monthly reporting be sold by itself?");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [conflict, setConflict] = useState<ConflictResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const test = async (liveAi: boolean, text = query) => {
    setPending(true); setError(null); setConflict(null); setResult(null);
    try { setResult(await post({ action: "test_memory_query", query: text, liveAi }) as QueryResult); }
    catch { setError(friendly()); }
    finally { setPending(false); }
  };
  const ask = (text: string) => { setQuery(text); void test(false, text); };

  const demonstrateConflict = async () => {
    setPending(true); setError(null); setResult(null);
    try { setConflict(await post({ action: "demonstrate_memory_conflict" }) as ConflictResult); }
    catch { setError(friendly()); }
    finally { setPending(false); }
  };

  return <div className="space-y-4 p-5" data-testid="commercial-memory-proof">
    <p className="text-[13px] leading-5 text-ink-2" data-testid="qa-claim">Ask anything about the merchant&apos;s saved documents. Code retrieves exact quotes; an AI re-ranker only reorders them; every answer cites its source line. Nothing here is written by a model, and when no document supports an answer it says so.</p>
    <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void test(false); }}>
      <label htmlFor="memory-proof-query" className="sr-only">Ask the rate card a question</label>
      <input id="memory-proof-query" data-testid="memory-proof-query" className="min-h-11 flex-1 rounded-lg border border-line-strong px-3 text-[15px] text-ink" value={query} maxLength={240} onChange={(event) => setQuery(event.target.value)} placeholder="Ask the rate card…" />
      <Button type="submit" variant="primary" className="min-h-11 px-5" disabled={pending || query.trim().length < 3} data-testid="memory-proof-run">{pending ? "Looking…" : "Test retrieval"}</Button>
    </form>
    <div className="flex flex-wrap gap-2" aria-label="Example questions" data-testid="qa-examples">
      {EXAMPLES.map((example) => <button key={example} type="button" disabled={pending} onClick={() => ask(example)} className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-surface-muted disabled:opacity-60">{example}</button>)}
      <button type="button" disabled={pending} onClick={() => ask(UNSUPPORTED)} className="rounded-full border border-[#f7dfb4] bg-amber-weak px-3 py-1.5 text-[13px] font-medium text-ink hover:brightness-95 disabled:opacity-60" data-testid="qa-unsupported">An unsupported question: {UNSUPPORTED.replace("?", "")}</button>
      <Button variant="ghost" disabled={pending} onClick={() => void demonstrateConflict()} data-testid="memory-proof-conflict">Show a source conflict</Button>
    </div>
    <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted">
      <Button disabled={pending || !liveAvailable || query.trim().length < 3} onClick={() => void test(true)} data-testid="memory-proof-live">Re-rank with AI</Button>
      <span>{liveAvailable ? "The AI may reorder the eligible excerpts only. It cannot add evidence or answer the question." : "AI re-ranking is off here (no live model key is set), so code retrieval is used."}</span>
    </div>
    {result ? <section className="rounded-xl border border-line bg-surface-muted p-4" data-testid="memory-proof-result">
      <div className="flex flex-wrap items-center gap-2"><strong className="text-[14px] text-ink">{result.status === "found" ? `${result.candidates.length} exact quote${result.candidates.length === 1 ? "" : "s"} found` : "Insufficient evidence"}</strong><span className="rounded-full bg-surface px-2 py-1 text-[11px] font-semibold text-ink-2">{attribution(result)}</span></div>
      <p className="mt-1 text-[12px] text-muted">{result.note}</p>
      {result.status === "insufficient_evidence" ? <p className="mt-3 text-[13px] text-ink-2">Commercial Memory found no eligible evidence and did not guess.</p> : <ol className="mt-3 space-y-2">
        {result.candidates.map((candidate) => <li key={candidate.chunkId} className="rounded-lg border border-line bg-surface px-3 py-2"><div className="text-[12px] font-semibold text-ink">Source: {candidate.sourceTitle} · from {candidate.effectiveFrom}</div><blockquote className="mt-1 border-l-2 border-blue pl-2 text-[13px] text-ink-2">{candidate.quote}</blockquote><div className="mt-1 font-mono text-[10px] text-muted">{candidate.chunkId}{candidate.relevance ? ` · ${candidate.relevance}` : ""}</div></li>)}
      </ol>}
    </section> : null}
    {conflict ? <section className="rounded-xl border border-[#f7dfb4] bg-amber-weak p-4" data-testid="memory-proof-conflict-result"><strong className="text-[14px] text-ink">Conflicting active values are blocked</strong><p className="mt-1 text-[13px] text-ink-2">Simulated proof only: ₹21,000 and ₹24,000 both claim to be the active website-fixes price. The system requires merchant review and does not draft either value.</p></section> : null}
    {error ? <p role="alert" className="text-[13px] text-red">{error}</p> : null}
  </div>;
}
