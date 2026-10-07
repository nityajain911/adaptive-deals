import { z } from "zod";
import { DEMO_ANCHOR } from "@/domain/clock";
import { activeEconomics, saveEconomicsDraft } from "@/lib/economics-store";
import { applyConfirmedEconomicsProposals, buildEconomicsEvidenceDraft } from "@/commercial-memory/economics-draft";
import { loadBundledKnowledgeSources } from "@/commercial-memory/source-schema";
import { recordEvidenceConfirmation, recordRetrievalRun } from "@/commercial-memory/store";

const draftInput = z.object({ action: z.literal("draft_economics_from_memory") }).strict();
const confirmInput = z.object({
  action: z.literal("confirm_economics_from_memory"),
  draftId: z.string().min(1),
  proposalIds: z.array(z.string().min(1)).max(20),
}).strict();
const inputSchema = z.discriminatedUnion("action", [draftInput, confirmInput]);

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
