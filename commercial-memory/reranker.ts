import { createHash } from "node:crypto";
import { z } from "zod";
import type { RetrievalCandidate } from "./retrieval";

export const COMMERCIAL_RERANK_VERSION = "commercial_retrieval_rerank.v1" as const;

export const CommercialRerankOutputSchema = z.object({
  order: z.array(z.string().min(1)),
  relevance: z.array(z.object({ chunkId: z.string().min(1), label: z.enum(["direct", "supporting", "irrelevant"]) }).strict()),
}).strict();

export interface CommercialRerankProvider {
  name: string;
  rerank(input: { version: typeof COMMERCIAL_RERANK_VERSION; query: string; candidates: { chunkId: string; title: string; date: string; excerpt: string }[] }): Promise<unknown>;
}

export interface RerankRecording {
  schema: "adaptive-deals.commercial-rerank-recording.v1";
  inputHash: string;
  output: unknown;
  provider: string;
  recordedAt: string;
}

export interface CommercialRerankResult {
  candidates: RetrievalCandidate[];
  attribution: "live_ai" | "recorded_ai" | "code";
  relevance: Map<string, "direct" | "supporting" | "irrelevant">;
  inputHash: string;
  note: string;
}

const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

export function rerankInputHash(query: string, candidates: RetrievalCandidate[]): string {
  return sha(JSON.stringify({ version: COMMERCIAL_RERANK_VERSION, query: query.trim(), candidates: candidates.map((item) => ({ id: item.id, hash: item.hash, score: item.score })) }));
}

function validateOutput(value: unknown, candidates: RetrievalCandidate[]) {
  const parsed = CommercialRerankOutputSchema.safeParse(value);
  if (!parsed.success) return null;
  const expected = candidates.map((candidate) => candidate.id).sort();
  const order = [...parsed.data.order].sort();
  const relevance = parsed.data.relevance.map((item) => item.chunkId).sort();
  if (new Set(parsed.data.order).size !== expected.length || new Set(relevance).size !== expected.length) return null;
  if (JSON.stringify(order) !== JSON.stringify(expected) || JSON.stringify(relevance) !== JSON.stringify(expected)) return null;
  return parsed.data;
}

function combine(candidates: RetrievalCandidate[], order: string[]): RetrievalCandidate[] {
  const aiRank = new Map(order.map((id, index) => [id, index + 1]));
  return [...candidates].map((candidate, lexicalIndex) => ({
    candidate,
    combined: 1 / (60 + lexicalIndex + 1) + 2 / (60 + (aiRank.get(candidate.id) ?? candidates.length + 1)),
    lexicalIndex,
  })).sort((a, b) => b.combined - a.combined || a.lexicalIndex - b.lexicalIndex).map((item) => item.candidate);
}

export async function rerankCommercialCandidates(query: string, candidates: RetrievalCandidate[], options: { provider?: CommercialRerankProvider; recording?: RerankRecording } = {}): Promise<CommercialRerankResult> {
  const inputHash = rerankInputHash(query, candidates);
  let raw: unknown = null;
  let attribution: CommercialRerankResult["attribution"] = "code";
  let note = "Ranked by deterministic lexical retrieval";
  if (options.recording?.inputHash === inputHash) {
    raw = options.recording.output;
    attribution = "recorded_ai";
    note = `Recorded ${options.recording.provider} rerank · exact input match`;
  } else if (options.provider) {
    try {
      raw = await options.provider.rerank({
        version: COMMERCIAL_RERANK_VERSION,
        query,
        candidates: candidates.map((item) => ({ chunkId: item.id, title: item.sourceTitle, date: item.effectiveFrom, excerpt: item.text })),
      });
      attribution = "live_ai";
      note = `Reranked live by ${options.provider.name}`;
    } catch {
      return { candidates, attribution: "code", relevance: new Map(), inputHash, note: "AI unavailable; lexical order kept" };
    }
  }
  if (attribution === "code") return { candidates, attribution, relevance: new Map(), inputHash, note };
  const output = validateOutput(raw, candidates);
  if (!output) return { candidates, attribution: "code", relevance: new Map(), inputHash, note: "AI output rejected; lexical order kept" };
  return { candidates: combine(candidates, output.order), attribution, relevance: new Map(output.relevance.map((item) => [item.chunkId, item.label])), inputHash, note };
}
