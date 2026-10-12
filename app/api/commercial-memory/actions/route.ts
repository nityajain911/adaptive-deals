import { createHash } from "node:crypto";
import { z } from "zod";
import { DEMO_ANCHOR } from "@/domain/clock";
import { activeEconomics, saveEconomicsDraft } from "@/lib/economics-store";
import { applyConfirmedEconomicsProposals, buildEconomicsEvidenceDraft, mergeDocumentReadings } from "@/commercial-memory/economics-draft";
import { loadReadings, readDocumentWithAi, readingLabel } from "@/commercial-memory/upload/ai-reader";
import { interpretDocumentReading } from "@/commercial-memory/upload/ai-reading";
import { readUploadedSource } from "@/commercial-memory/upload/proposals";
import { loadKnowledgeSources } from "@/lib/knowledge";
import { buildUploadSource, uploadRequestSchema } from "@/commercial-memory/upload/ingest";
import { UploadError } from "@/commercial-memory/upload/limits";
import { saveUploadedSource, withdrawUploadedSource } from "@/commercial-memory/upload/store";
import { recordEvidenceConfirmation, recordRetrievalRun } from "@/commercial-memory/store";
import { chunkSource } from "@/commercial-memory/chunker";
import { retrieveCommercialEvidence } from "@/commercial-memory/retrieval";
import { rerankCommercialCandidates } from "@/commercial-memory/reranker";
import { createLiveCommercialRerankProvider } from "@/commercial-memory/reranker-provider";
import { detectEvidenceConflicts } from "@/commercial-memory/conflicts";

const draftInput = z.object({ action: z.literal("draft_economics_from_memory") }).strict();
const confirmInput = z.object({
  action: z.literal("confirm_economics_from_memory"),
  draftId: z.string().min(1),
  proposalIds: z.array(z.string().min(1)).max(20),
}).strict();
const testQueryInput = z.object({
  action: z.literal("test_memory_query"),
  query: z.string().trim().min(3).max(240),
  liveAi: z.boolean().default(false),
}).strict();
const conflictInput = z.object({ action: z.literal("demonstrate_memory_conflict") }).strict();
const uploadInput = z.object({ action: z.literal("upload_memory_source"), ...uploadRequestSchema.shape }).strict();
const withdrawInput = z.object({ action: z.literal("withdraw_memory_source"), sourceId: z.string().regex(/^upload-[a-f0-9]{16}$/) }).strict();
const inputSchema = z.discriminatedUnion("action", [draftInput, confirmInput, testQueryInput, conflictInput, uploadInput, withdrawInput]);

const reply = (body: unknown, status = 200) => Response.json(body, { status });

const currentDraft = async () => {
  const active = await activeEconomics();
  const sources = await loadKnowledgeSources();
  const readings = await loadReadings(sources);
  const draft = buildEconomicsEvidenceDraft(active, sources, "2026-10-08", Object.fromEntries(Object.entries(readings).map(([id, reading]) => [id, reading.rawOutput])));
  const readers = Object.entries(readings).map(([sourceId, reading]) => ({ sourceId, label: "AI reader" }));
  return { active, sources, draft, readers };
};

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    if (input.action === "upload_memory_source") {
      const { action: _action, ...request } = input;
      void _action;
      const active = await activeEconomics();
      const existing = await loadKnowledgeSources();
      if (request.supersedes) {
        const target = existing.find((item) => item.id === request.supersedes);
        if (!target || target.status !== "active" || target.kind !== request.kind) throw new UploadError("The document to replace must be an active source of the same type");
      }
      const built = await buildUploadSource(request, new Date().toISOString());
      // Two readers: the built-in line reader, and the AI (a recording, or a live call only when switched on). Code checks the AI against the document.
      const rules = readUploadedSource(active, built.source);
      const outcome = await readDocumentWithAi(active, built.source);
      const ai = "reading" in outcome ? interpretDocumentReading(active, built.source, outcome.reading.rawOutput) : null;
      const merged = mergeDocumentReadings(rules, ai);
      if (merged.proposals.length === 0) {
        throw new UploadError(`No ${request.kind === "rate_card" ? "prices" : "costs"} for your services were found. Each line or row must name one of your services and give exactly one amount.`, merged.notes.slice(0, 20));
      }
      const saved = await saveUploadedSource(built.source);
      const { source } = saved;
      const reader = "reading" in outcome
        ? { mode: outcome.mode, label: "AI reader", proposed: ai?.proposed ?? 0, rejected: ai?.rejected ?? 0, message: null as string | null }
        : { mode: outcome.mode, label: null as string | null, proposed: 0, rejected: 0, message: outcome.message as string | null };
      return reply({ ok: true, result: { sourceId: source.id, title: source.title, kind: source.kind, alreadyStored: saved.alreadyStored, proposalCount: merged.proposals.length, considered: rules.considered, notes: merged.notes.slice(0, 20), extractedText: built.extractedText, reader } });
    }
    if (input.action === "withdraw_memory_source") {
      const withdrawn = await withdrawUploadedSource(input.sourceId);
      return reply({ ok: true, result: { sourceId: withdrawn.id, status: withdrawn.status } });
    }
    const { active, sources, draft, readers } = await currentDraft();
    if (input.action === "test_memory_query") {
      const lexical = retrieveCommercialEvidence(input.query, {
        merchantId: "merchant-pinecone",
        buyerId: "buyer-harbour-fresh",
        asOf: "2026-10-08",
        allowedAccess: ["merchant_wide", "commercial", "finance_restricted", "buyer_specific"],
        limit: 8,
      }, sources, sources.flatMap(chunkSource));
      const provider = input.liveAi ? createLiveCommercialRerankProvider() : undefined;
      const ranked = await rerankCommercialCandidates(input.query, lexical.candidates, { provider });
      const id = `memory-test-${createHash("sha256").update(JSON.stringify({
        query: input.query,
        // The same question asked over a different set of documents is a different run, never a clash with the earlier record.
        eligibleSourceIds: lexical.eligibleSourceIds,
        inputHash: ranked.inputHash,
        attribution: ranked.attribution,
        selectedChunkIds: ranked.candidates.map((candidate) => candidate.id),
      }), "utf8").digest("hex").slice(0, 16)}`;
      await recordRetrievalRun({
        id,
        merchantId: "merchant-pinecone",
        buyerId: "buyer-harbour-fresh",
        query: input.query,
        normalisedQuery: lexical.normalisedQuery,
        eligibleSourceIds: lexical.eligibleSourceIds,
        candidateChunkIds: lexical.candidates.map((candidate) => candidate.id),
        selectedChunkIds: ranked.candidates.map((candidate) => candidate.id),
        ranking: ranked.attribution,
        status: lexical.status,
        createdAt: DEMO_ANCHOR,
      });
      return reply({ ok: true, result: {
        id,
        status: lexical.status,
        attribution: ranked.attribution,
        note: ranked.note,
        candidates: ranked.candidates.map((candidate) => ({
          chunkId: candidate.id,
          sourceId: candidate.sourceId,
          sourceTitle: candidate.sourceTitle,
          effectiveFrom: candidate.effectiveFrom,
          access: candidate.access,
          quote: candidate.text,
          score: candidate.score,
          relevance: ranked.relevance.get(candidate.id) ?? null,
        })),
      } });
    }
    if (input.action === "demonstrate_memory_conflict") {
      const current = sources.find((source) => source.id === "source-rate-card-2026")!;
      const historical = sources.find((source) => source.id === "source-rate-card-2025")!;
      const simulatedHistorical = { ...historical, status: "active" as const, effectiveTo: null };
      const field = "services.website-fixes.listPricePaise";
      const conflicts = detectEvidenceConflicts([
        { id: "claim-current", field, value: "2400000", sourceId: current.id, quote: "Website fixes,24000,one time", start: current.content.indexOf("Website fixes"), end: current.content.indexOf("Website fixes") + "Website fixes,24000,one time".length },
        { id: "claim-simulated-old", field, value: "2100000", sourceId: simulatedHistorical.id, quote: "Website fixes,21000,one time", start: historical.content.indexOf("Website fixes"), end: historical.content.indexOf("Website fixes") + "Website fixes,21000,one time".length },
      ], [current, simulatedHistorical], "2026-10-08");
      return reply({ ok: true, result: { status: "conflicting_evidence", simulated: true, ...conflicts[0] } });
    }
    if (input.action === "draft_economics_from_memory") {
      await recordRetrievalRun({
        id: draft.id,
        merchantId: "merchant-pinecone",
        buyerId: null,
        query: "Draft service prices and direct costs for Business economics",
        normalisedQuery: "draft service prices direct costs business economics",
        eligibleSourceIds: [...new Set(draft.proposals.map((proposal) => proposal.sourceId))].sort(),
        candidateChunkIds: draft.proposals.map((proposal) => proposal.id),
        selectedChunkIds: draft.proposals.filter((proposal) => proposal.status === "supported").map((proposal) => proposal.id),
        ranking: "code",
        status: draft.status === "ready" ? "found" : draft.status,
        createdAt: DEMO_ANCHOR,
      });
      return reply({ ok: true, result: { ...draft, readers } });
    }

    if (input.draftId !== draft.id) throw new Error("The evidence or Business economics changed; draft it again before confirming");
    const content = applyConfirmedEconomicsProposals(active, draft, input.proposalIds);
    await saveEconomicsDraft(content);
    for (const proposalId of input.proposalIds) {
      const proposal = draft.proposals.find((item) => item.id === proposalId)!;
      await recordEvidenceConfirmation({
        // One confirmation per claim per draft: the same claim confirmed again under a different set of sources is a new decision, not a conflict.
        id: `confirmation-${createHash("sha256").update(`${draft.id}:${proposal.id}`, "utf8").digest("hex").slice(0, 20)}`,
        retrievalRunId: draft.id,
        field: proposal.field,
        claimId: proposal.id,
        decision: "confirmed",
        decidedBy: "Merchant (Pinecone Media Works)",
        decidedAt: DEMO_ANCHOR,
        reason: null,
      });
    }
    return reply({ ok: true, result: { savedDraft: true, confirmed: input.proposalIds.length, economicsVersion: active.version, sourceCount: sources.length, content } });
  } catch (error) {
    const message = error instanceof z.ZodError ? "Invalid Commercial Memory action" : error instanceof Error ? error.message : "Commercial Memory action failed";
    return reply({ ok: false, error: message, ...(error instanceof UploadError && error.notes.length ? { notes: error.notes } : {}) }, 400);
  }
}
