import type { ConversationItem } from "@/domain/conversation";
import { isResolvingDisposition, type SelectedOption, type WorkDisposition } from "./deal-records";

type EvidenceState = {
  conversation: ConversationItem[];
  selectedOption: SelectedOption | null;
  workDispositions: WorkDisposition[];
};

const isResolving = (d: WorkDisposition) => isResolvingDisposition(d.kind);

function clarificationReplyIds(s: EvidenceState): Set<string> {
  const questions = new Set(s.conversation.filter((m) => m.kind === "clarification").map((m) => m.id));
  return new Set(s.conversation.filter((m) => m.direction === "inbound" && m.inReplyTo && questions.has(m.inReplyTo) && m.kind !== "change_request").map((m) => m.id));
}

/** Evidence the merchant has already used or explicitly reviewed for the selected option. */
export function decisionEvidenceSnapshot(s: EvidenceState): string[] {
  const inClarificationThread = clarificationReplyIds(s);
  const ids = new Set(
    s.conversation
      .filter((m) => m.direction === "inbound" && inClarificationThread.has(m.id) && !!m.refs.answerValue)
      .map((m) => m.id),
  );
  for (const d of s.workDispositions) if (d.sourceKind === "message" && inClarificationThread.has(d.sourceId) && isResolving(d)) ids.add(d.sourceId);
  return s.conversation.filter((m) => ids.has(m.id)).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).map((m) => m.id);
}

/** Later buyer statements in a clarification thread that could change a commercial decision. */
export function unreviewedDecisionEvidence(s: EvidenceState): ConversationItem[] {
  if (!s.selectedOption) return [];
  const inClarificationThread = clarificationReplyIds(s);
  const hasSelectionSnapshot = (s.selectedOption.evidenceMessageIds ?? []).length > 0;
  const reviewed = new Set(s.selectedOption.evidenceMessageIds ?? []);
  for (const d of s.workDispositions) if (d.sourceKind === "message" && isResolving(d)) reviewed.add(d.sourceId);
  return s.conversation.filter(
    (m) =>
      m.direction === "inbound" &&
      m.kind !== "change_request" &&
      inClarificationThread.has(m.id) &&
      (hasSelectionSnapshot || Date.parse(m.createdAt) > Date.parse(s.selectedOption!.selectedAt)) &&
      m.classification?.kind !== "acknowledgement" &&
      !reviewed.has(m.id),
  );
}
