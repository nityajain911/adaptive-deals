import { createHash } from "node:crypto";
import { z } from "zod";
import { DEMO_ANCHOR } from "@/domain/clock";
import { activeEconomics, saveEconomicsDraft } from "@/lib/economics-store";
import { applyConfirmedEconomicsProposals, buildEconomicsEvidenceDraft } from "@/commercial-memory/economics-draft";
import { loadBundledKnowledgeSources } from "@/commercial-memory/source-schema";
import { recordEvidenceConfirmation, recordRetrievalRun } from "@/commercial-memory/store";
import { chunkSource } from "@/commercial-memory/chunker";
import { retrieveCommercialEvidence } from "@/commercial-memory/retrieval";
import { rerankCommercialCandidates } from "@/commercial-memory/reranker";
import { GroqCommercialRerankProvider } from "@/commercial-memory/reranker-provider";
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
const inputSchema = z.discriminatedUnion("action", [draftInput, confirmInput, testQueryInput, conflictInput]);

const reply = (body: unknown, status = 200) => Response.json(body, { status });

const currentDraft = async () => {
  const active = await activeEconomics();
  const sources = loadBundledKnowledgeSources();
  return { active, sources, draft: buildEconomicsEvidenceDraft(active, sources, "2026-10-08") };
};

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    const { active, sources, draft } = await currentDraft();
    if (input.action === "test_memory_query") {
      const lexical = retrieveCommercialEvidence(input.query, {
        merchantId: "merchant-pinecone",
        buyerId: "buyer-kestrel",
        asOf: "2026-10-08",
        allowedAccess: ["merchant_wide", "commercial", "finance_restricted", "buyer_specific"],
        limit: 8,
      }, sources, sources.flatMap(chunkSource));
      const provider = input.liveAi && process.env.GROQ_API_KEY?.trim() ? new GroqCommercialRerankProvider() : undefined;
      const ranked = await rerankCommercialCandidates(input.query, lexical.candidates, { provider });
      const id = `memory-test-${createHash("sha256").update(`${input.query}:${ranked.inputHash}`, "utf8").digest("hex").slice(0, 16)}`;
      await recordRetrievalRun({
        id,
        merchantId: "merchant-pinecone",
        buyerId: "buyer-kestrel",
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
      return reply({ ok: true, result: draft });
    }

    if (input.draftId !== draft.id) throw new Error("The evidence or Business economics changed; draft it again before confirming");
    const content = applyConfirmedEconomicsProposals(active, draft, input.proposalIds);
    await saveEconomicsDraft(content);
    for (const proposalId of input.proposalIds) {
      const proposal = draft.proposals.find((item) => item.id === proposalId)!;
      await recordEvidenceConfirmation({
        id: `confirmation-${proposal.id}`,
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
    return reply({ ok: false, error: message }, 400);
  }
}
