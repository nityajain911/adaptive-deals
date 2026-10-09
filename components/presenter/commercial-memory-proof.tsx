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

const attribution = (result: QueryResult) => result.attribution === "live_ai" ? "Live AI rerank" : result.attribution === "recorded_ai" ? "Recorded AI rerank" : "Code retrieval";

export function CommercialMemoryProof({ liveAvailable }: { liveAvailable: boolean }) {
  const [query, setQuery] = useState("Can monthly reporting be sold by itself?");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [conflict, setConflict] = useState<ConflictResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const test = async (liveAi: boolean) => {
    setPending(true); setError(null); setConflict(null);
    try { setResult(await post({ action: "test_memory_query", query, liveAi }) as QueryResult); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Commercial Memory proof failed"); }
    finally { setPending(false); }
  };

  const demonstrateConflict = async () => {
    setPending(true); setError(null); setResult(null);
    try { setConflict(await post({ action: "demonstrate_memory_conflict" }) as ConflictResult); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Commercial Memory proof failed"); }
    finally { setPending(false); }
  };

  return <div className="space-y-4 p-5" data-testid="commercial-memory-proof">
    <div>
      <label htmlFor="memory-proof-query" className="text-[13px] font-semibold text-ink">Ask an unseen question</label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input id="memory-proof-query" data-testid="memory-proof-query" className="min-h-10 flex-1 rounded-lg border border-line-strong px-3 text-[14px] text-ink" value={query} maxLength={240} onChange={(event) => setQuery(event.target.value)} />
        <Button variant="primary" disabled={pending || query.trim().length < 3} onClick={() => void test(false)} data-testid="memory-proof-run">Test retrieval</Button>
        <Button disabled={pending || !liveAvailable || query.trim().length < 3} onClick={() => void test(true)} data-testid="memory-proof-live">Try live AI rerank</Button>
      </div>
      <p className="mt-1 text-[12px] text-muted">Retrieval runs in code first. Live AI may reorder only the eligible chunk IDs; it cannot add evidence or answer the question.</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button variant="ghost" onClick={() => setQuery("What is our office electricity bill?")}>Use unsupported query</Button>
      <Button variant="ghost" disabled={pending} onClick={() => void demonstrateConflict()} data-testid="memory-proof-conflict">Show simulated source conflict</Button>
    </div>
    {result ? <section className="rounded-xl border border-line bg-surface-muted p-4" data-testid="memory-proof-result">
      <div className="flex flex-wrap items-center gap-2"><strong className="text-[14px] text-ink">{result.status === "found" ? `${result.candidates.length} eligible excerpts` : "Insufficient evidence"}</strong><span className="rounded-full bg-surface px-2 py-1 text-[11px] font-semibold text-ink-2">{attribution(result)}</span></div>
      <p className="mt-1 text-[12px] text-muted">{result.note}</p>
      {result.status === "insufficient_evidence" ? <p className="mt-3 text-[13px] text-ink-2">Commercial Memory found no eligible evidence and did not guess.</p> : <ol className="mt-3 space-y-2">
        {result.candidates.map((candidate) => <li key={candidate.chunkId} className="rounded-lg border border-line bg-surface px-3 py-2"><div className="text-[12px] font-semibold text-ink">{candidate.sourceTitle} · from {candidate.effectiveFrom}</div><blockquote className="mt-1 border-l-2 border-blue pl-2 text-[13px] text-ink-2">{candidate.quote}</blockquote><div className="mt-1 font-mono text-[10px] text-muted">{candidate.chunkId}{candidate.relevance ? ` · ${candidate.relevance}` : ""}</div></li>)}
      </ol>}
    </section> : null}
    {conflict ? <section className="rounded-xl border border-[#f7dfb4] bg-amber-weak p-4" data-testid="memory-proof-conflict-result"><strong className="text-[14px] text-ink">Conflicting active values are blocked</strong><p className="mt-1 text-[13px] text-ink-2">Simulated proof only: ₹21,000 and ₹24,000 both claim to be the active website-fixes price. The system requires merchant review and does not draft either value.</p></section> : null}
    {error ? <p role="alert" className="text-[13px] text-red">{error}</p> : null}
  </div>;
}
