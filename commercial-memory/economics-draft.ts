import { createHash } from "node:crypto";
import { economicsContentOf, type BusinessEconomics, type EconomicsContent } from "@/domain/business-economics";
import { chunkSource } from "./chunker";
import type { KnowledgeSource } from "./types";
import { readUploadedSource } from "./upload/proposals";
import { interpretDocumentReading } from "./upload/ai-reading";
import type { UploadNote } from "./upload/limits";

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
  /** Who read this value from the document: the built-in line reader, the AI (checked against the document), or both, agreeing. */
  reader?: "rules" | "ai" | "both";
  /** The document's own wording, when an AI matched it to one of the merchant's services under another name. */
  matchedAs?: string;
}

export interface EconomicsEvidenceDraft {
  id: string;
  economicsVersion: number;
  economicsHash: string;
  sourceSetHash: string;
  status: "ready" | "conflicting_evidence" | "insufficient_evidence";
  proposals: EconomicsEvidenceProposal[];
  /** Lines in uploaded documents that were not used, with the reason for each. */
  notes?: (UploadNote & { sourceId: string; sourceTitle: string })[];
  /** Which documents also have an AI reading, and how it is labelled. Set by the server when it sends the draft. */
  readers?: { sourceId: string; label: string }[];
}

const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

const currentSource = (source: KnowledgeSource, asOf: string) => source.merchantId === "merchant-pinecone" && source.status === "active" && source.effectiveFrom <= asOf && (!source.effectiveTo || source.effectiveTo >= asOf);

/**
 * Combine what the built-in line reader and the AI reader found in one document. The rules reader wins any disagreement
 * (the AI value is dropped with a note); a value both found is kept once and marked as found by both.
 */
export function mergeDocumentReadings(rules: { proposals: EconomicsEvidenceProposal[]; notes: UploadNote[] }, ai: { proposals: EconomicsEvidenceProposal[]; notes: UploadNote[] } | null): { proposals: EconomicsEvidenceProposal[]; notes: UploadNote[] } {
  const proposals: EconomicsEvidenceProposal[] = rules.proposals.map((proposal) => ({ ...proposal, reader: "rules" }));
  const notes = [...rules.notes];
  if (!ai) return { proposals, notes };
  for (const found of ai.proposals) {
    const same = proposals.find((proposal) => proposal.field === found.field && proposal.sourceId === found.sourceId);
    if (!same) { proposals.push(found); continue; }
    if (same.proposedValue === found.proposedValue) { same.reader = "both"; continue; }
    notes.push({ line: found.quote.slice(0, 120), reason: `The AI read a different amount for ${found.serviceName} than the line reader did, so the line reader's value is kept` });
  }
  for (const item of ai.notes) if (!notes.some((existing) => existing.line === item.line && existing.reason === item.reason)) notes.push(item);
  return { proposals, notes };
}

export function buildEconomicsEvidenceDraft(active: BusinessEconomics, sources: KnowledgeSource[], asOf: string, aiReadings: Record<string, unknown> = {}): EconomicsEvidenceDraft {
  const proposals: EconomicsEvidenceProposal[] = [];
  const relevant = sources.filter((source) => currentSource(source, asOf) && (source.kind === "rate_card" || source.kind === "cost_sheet"));
  const notes: NonNullable<EconomicsEvidenceDraft["notes"]> = [];
  for (const source of relevant) {
    if (source.origin) {
      // An uploaded document: read line by line, each value quoting its own line, with every skipped line explained.
      const rules = readUploadedSource(active, source);
      const ai = aiReadings[source.id] === undefined ? null : interpretDocumentReading(active, source, aiReadings[source.id]);
      const merged = mergeDocumentReadings(rules, ai);
      proposals.push(...merged.proposals);
      notes.push(...merged.notes.map((note) => ({ ...note, sourceId: source.id, sourceTitle: source.title })));
      continue;
    }
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
  const sourceSetHash = sha(relevant.map((source) => `${source.id}:${source.contentHash}:${aiReadings[source.id] === undefined ? "" : sha(JSON.stringify(aiReadings[source.id]))}`).sort().join("\n"));
  return {
    id: `economics-evidence-${sha(`${active.hash}:${sourceSetHash}`).slice(0, 20)}`,
    economicsVersion: active.version,
    economicsHash: active.hash,
    sourceSetHash,
    status: proposals.some((proposal) => proposal.status === "conflicting") ? "conflicting_evidence" : proposals.length ? "ready" : "insufficient_evidence",
    proposals,
    ...(notes.length ? { notes } : {}),
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
