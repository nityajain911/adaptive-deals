import type { KnowledgeAccess, KnowledgeChunk, KnowledgeSource } from "./types";
import { extractAmountsPaise, extractEntities, normaliseTokens } from "./normalise";
import { knowledgeContentHash } from "./source-schema";

export interface RetrievalContext {
  merchantId: string;
  buyerId: string | null;
  asOf: string;
  allowedAccess: KnowledgeAccess[];
  limit?: number;
  threshold?: number;
}

export interface RetrievalCandidate extends KnowledgeChunk {
  sourceTitle: string;
  sourceKind: KnowledgeSource["kind"];
  effectiveFrom: string;
  access: KnowledgeAccess;
  score: number;
  scoreParts: { tokens: number; entities: number; amounts: number; phrase: number };
}

export interface RetrievalResult {
  status: "found" | "insufficient_evidence";
  normalisedQuery: string;
  candidates: RetrievalCandidate[];
  eligibleSourceIds: string[];
}

const eligible = (source: KnowledgeSource, context: RetrievalContext): boolean => {
  if (source.merchantId !== context.merchantId) return false;
  if (!context.allowedAccess.includes(source.access)) return false;
  if (source.status !== "active") return false;
  if (source.effectiveFrom > context.asOf) return false;
  if (source.effectiveTo && source.effectiveTo < context.asOf) return false;
  if (source.access === "buyer_specific" && (!context.buyerId || source.buyerId !== context.buyerId)) return false;
  return true;
};

const scoreChunk = (query: string, chunk: KnowledgeChunk) => {
  const queryTokens = normaliseTokens(query);
  const queryEntities = extractEntities(query);
  const queryAmounts = extractAmountsPaise(query);
  const tokens = queryTokens.filter((token) => chunk.tokens.includes(token)).length * 2;
  const entities = queryEntities.filter((entity) => chunk.entities.includes(entity)).length * 8;
  const amounts = queryAmounts.filter((amount) => chunk.amountsPaise.includes(amount)).length * 10;
  const compact = query.trim().toLowerCase().replace(/\s+/g, " ");
  const phrase = compact.length >= 8 && chunk.text.toLowerCase().replace(/\s+/g, " ").includes(compact) ? 12 : 0;
  return { score: tokens + entities + amounts + phrase, parts: { tokens, entities, amounts, phrase } };
};

export function retrieveCommercialEvidence(query: string, context: RetrievalContext, sources: KnowledgeSource[], chunks: KnowledgeChunk[]): RetrievalResult {
  const sourceById = new Map(sources.filter((source) => eligible(source, context)).map((source) => [source.id, source]));
  const threshold = context.threshold ?? 4;
  const candidates = chunks.flatMap((chunk): RetrievalCandidate[] => {
    const source = sourceById.get(chunk.sourceId);
    if (!source) return [];
    const { score, parts } = scoreChunk(query, chunk);
    if (score < threshold) return [];
    return [{ ...chunk, sourceTitle: source.title, sourceKind: source.kind, effectiveFrom: source.effectiveFrom, access: source.access, score, scoreParts: parts }];
  }).sort((a, b) => b.score - a.score || b.effectiveFrom.localeCompare(a.effectiveFrom) || a.id.localeCompare(b.id)).slice(0, context.limit ?? 8);
  return {
    status: candidates.length ? "found" : "insufficient_evidence",
    normalisedQuery: normaliseTokens(query).join(" "),
    candidates,
    eligibleSourceIds: [...sourceById.keys()].sort(),
  };
}

export type CitationCheck = { ok: true } | { ok: false; reason: "source_hash_mismatch" | "chunk_hash_mismatch" | "quote_outside_chunk" | "quote_offset_mismatch" | "inside_instruction" };

export function validateCitation(source: KnowledgeSource, chunk: KnowledgeChunk, citation: { start: number; end: number; quote: string }): CitationCheck {
  if (knowledgeContentHash(source.content) !== source.contentHash) return { ok: false, reason: "source_hash_mismatch" };
  if (knowledgeContentHash(chunk.text) !== chunk.hash) return { ok: false, reason: "chunk_hash_mismatch" };
  if (citation.start < chunk.start || citation.end > chunk.end || citation.end <= citation.start) return { ok: false, reason: "quote_outside_chunk" };
  if (source.content.slice(citation.start, citation.end) !== citation.quote) return { ok: false, reason: "quote_offset_mismatch" };
  const localStart = citation.start - chunk.start;
  const localEnd = citation.end - chunk.start;
  if (chunk.instructionSpans.some((span) => localStart < span.end && localEnd > span.start)) return { ok: false, reason: "inside_instruction" };
  return { ok: true };
}
