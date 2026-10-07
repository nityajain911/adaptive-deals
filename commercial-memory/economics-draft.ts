import { createHash } from "node:crypto";
import { economicsContentOf, type BusinessEconomics, type EconomicsContent } from "@/domain/business-economics";
import { chunkSource } from "./chunker";
import type { KnowledgeSource } from "./types";

export interface EconomicsEvidenceProposal {
  id: string;
  field: string;
  serviceId: string;
  serviceName: string;
  proposedValue: number;
  currentValue: number;
  sourceId: string;
  sourceTitle: string;
  sourceHash: string;
  quote: string;
  start: number;
  end: number;
  status: "supported" | "conflicting";
}

export interface EconomicsEvidenceDraft {
  id: string;
  economicsVersion: number;
  economicsHash: string;
  sourceSetHash: string;
  status: "ready" | "conflicting_evidence" | "insufficient_evidence";
  proposals: EconomicsEvidenceProposal[];
}

const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

const currentSource = (source: KnowledgeSource, asOf: string) => source.merchantId === "merchant-pinecone" && source.status === "active" && source.effectiveFrom <= asOf && (!source.effectiveTo || source.effectiveTo >= asOf);

export function buildEconomicsEvidenceDraft(active: BusinessEconomics, sources: KnowledgeSource[], asOf: string): EconomicsEvidenceDraft {
  const proposals: EconomicsEvidenceProposal[] = [];
  const relevant = sources.filter((source) => currentSource(source, asOf) && (source.kind === "rate_card" || source.kind === "cost_sheet"));
  for (const source of relevant) {
    for (const chunk of chunkSource(source)) {
      if (chunk.instructionSpans.length) continue;
      const cells = chunk.text.split(",").map((cell) => cell.trim());
      const service = active.services.find((item) => item.name.toLowerCase() === cells[0]?.toLowerCase());
      const rupees = Number(cells[1]);
      if (!service || !Number.isSafeInteger(rupees) || rupees <= 0) continue;
      const valueKey = source.kind === "rate_card" ? "listPricePaise" : "directCostPaise";
      const field = `services.${service.id}.${valueKey}`;
      const proposedValue = rupees * 100;
      proposals.push({
        id: `claim-${sha(`${field}:${source.id}:${proposedValue}:${chunk.start}:${chunk.end}`).slice(0, 20)}`,
        field,
        serviceId: service.id,
        serviceName: service.name,
        proposedValue,
        currentValue: service[valueKey],
        sourceId: source.id,
        sourceTitle: source.title,
        sourceHash: source.contentHash,
        quote: chunk.text,
        start: chunk.start,
        end: chunk.end,
        status: "supported",
      });
    }
  }
  const byField = new Map<string, EconomicsEvidenceProposal[]>();
  for (const proposal of proposals) byField.set(proposal.field, [...(byField.get(proposal.field) ?? []), proposal]);
  for (const group of byField.values()) {
    if (new Set(group.map((proposal) => proposal.proposedValue)).size > 1) for (const proposal of group) proposal.status = "conflicting";
  }
  proposals.sort((a, b) => a.field.localeCompare(b.field) || a.sourceId.localeCompare(b.sourceId));
  const sourceSetHash = sha(relevant.map((source) => `${source.id}:${source.contentHash}`).sort().join("\n"));
  return {
    id: `economics-evidence-${sha(`${active.hash}:${sourceSetHash}`).slice(0, 20)}`,
    economicsVersion: active.version,
    economicsHash: active.hash,
    sourceSetHash,
    status: proposals.some((proposal) => proposal.status === "conflicting") ? "conflicting_evidence" : proposals.length ? "ready" : "insufficient_evidence",
    proposals,
  };
}

export function applyConfirmedEconomicsProposals(active: BusinessEconomics, draft: EconomicsEvidenceDraft, confirmedProposalIds: string[]): EconomicsContent {
  if (draft.economicsVersion !== active.version || draft.economicsHash !== active.hash) throw new Error("The Business economics version changed; retrieve the evidence again");
  const selected = confirmedProposalIds.map((id) => {
    const proposal = draft.proposals.find((item) => item.id === id);
    if (!proposal) throw new Error(`Unknown economics evidence proposal ${id}`);
    if (proposal.status === "conflicting") throw new Error(`Resolve conflicting evidence for ${proposal.field} before confirmation`);
    return proposal;
  });
  const content = economicsContentOf(active);
  for (const proposal of selected) {
    const service = content.services.find((item) => item.id === proposal.serviceId);
    if (!service) throw new Error(`Service ${proposal.serviceId} is no longer available`);
    if (proposal.field.endsWith(".listPricePaise")) service.listPricePaise = proposal.proposedValue;
    else if (proposal.field.endsWith(".directCostPaise")) service.directCostPaise = proposal.proposedValue;
    else throw new Error(`Unsupported economics evidence field ${proposal.field}`);
  }
  return content;
}
