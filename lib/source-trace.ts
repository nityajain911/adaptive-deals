import type { FieldCard } from "@/ai/run-record";
import type { EconomicsEvidenceDraft } from "@/commercial-memory/economics-draft";
import type { KnowledgeSource } from "@/commercial-memory/types";
import { formatINR } from "@/domain/money";
import type { Message } from "@/domain/types";

export interface SourceTrace {
  id: string;
  sourceKind: "buyer_message" | "business_document";
  sourceLabel: string;
  quote: string;
  derivedLabel: string;
  derivedValue: string;
  usage: string;
  sourceId: string;
}

export interface SourceTraceState {
  profile: FieldCard[];
  messages: Message[];
  documentDraft?: EconomicsEvidenceDraft | null;
  documentSources?: KnowledgeSource[];
}

const BUYER_USAGE: Record<string, string> = {
  budgetNow: "Used to check which payments fit now",
  nextBudget: "Used to check when later payments can begin",
  approvalLimit: "Used to check whether buyer approval is required",
  approvalScope: "Used to apply the approval limit correctly",
  amountsIncludeGst: "Used to compare buyer limits with the same GST basis",
  latestStart: "Used to check whether work can start in time",
  requiredPackages: "Used to keep required work in the offer",
  optionalPackages: "Used to identify work that may be deferred",
};

/**
 * Presentation-only lineage from already verified records. Invalid citations disappear instead of
 * being repaired or inferred here; extraction and economics remain the source of truth.
 */
export function sourceTracesForDeal(state: SourceTraceState): SourceTrace[] {
  const traces: SourceTrace[] = [];
  const messages = new Map(state.messages.map((message) => [message.id, message]));

  for (const field of state.profile) {
    const usage = BUYER_USAGE[field.key];
    if (!usage || !field.display) continue;
    for (const evidence of field.evidence) {
      const message = messages.get(evidence.messageId);
      if (!message || message.author !== "buyer" || message.text.slice(evidence.start, evidence.end) !== evidence.quote) continue;
      traces.push({
        id: `trace-buyer-${field.key}-${message.id}-${evidence.start}-${evidence.end}`,
        sourceKind: "buyer_message",
        sourceLabel: "Buyer message",
        quote: evidence.quote,
        derivedLabel: field.label,
        derivedValue: field.display,
        usage,
        sourceId: message.id,
      });
    }
  }

  const sources = new Map((state.documentSources ?? []).map((source) => [source.id, source]));
  for (const proposal of state.documentDraft?.proposals ?? []) {
    const source = sources.get(proposal.sourceId);
    if (!source || source.status !== "active" || proposal.status !== "supported") continue;
    if (source.content.slice(proposal.start, proposal.end) !== proposal.quote) continue;
    const isCost = proposal.field.endsWith(".directCostPaise");
    const isPrice = proposal.field.endsWith(".listPricePaise");
    if (!isCost && !isPrice) continue;
    traces.push({
      id: `trace-document-${proposal.field}-${proposal.sourceId}-${proposal.start}-${proposal.end}`,
      sourceKind: "business_document",
      sourceLabel: proposal.sourceTitle,
      quote: proposal.quote,
      derivedLabel: `${proposal.serviceName} ${isCost ? "delivery cost" : "standard price"}`,
      derivedValue: formatINR(proposal.proposedValue),
      usage: isCost ? "Used to calculate what you keep" : "Used to calculate the offer total",
      sourceId: proposal.sourceId,
    });
  }

  return traces;
}
