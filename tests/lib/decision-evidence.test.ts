import { describe, expect, it } from "vitest";
import { decisionEvidenceSnapshot, unreviewedDecisionEvidence } from "@/lib/decision-evidence";

const clarification = { id: "q-1", kind: "clarification", direction: "outbound", createdAt: "2026-10-01T09:00:00+05:30", refs: { questionId: "clar-gst" } };
const answer = { id: "a-1", kind: "buyer_reply", direction: "inbound", createdAt: "2026-10-01T09:20:00+05:30", inReplyTo: "q-1", refs: { answerValue: "yes" }, classification: { kind: "needs_attention" } };
const correction = { id: "a-2", kind: "buyer_reply", direction: "inbound", createdAt: "2026-10-01T10:00:00+05:30", inReplyTo: "q-1", refs: {}, classification: { kind: "needs_attention" }, text: "Correction: our available budget is now only ₹20,000 including GST." };
const state = (over: Record<string, unknown> = {}) => ({
  conversation: [clarification, answer],
  selectedOption: { structureId: "phase-1", fingerprint: "f", selectedAt: "2026-10-01T09:30:00+05:30", draftVersion: 1, evidenceMessageIds: ["a-1"] },
  workDispositions: [],
  ...over,
}) as never;

describe("decision evidence boundary", () => {
  it("snapshots the buyer replies that support the recorded clarification answers", () => {
    expect(decisionEvidenceSnapshot(state())).toEqual(["a-1"]);
  });

  it("finds a later commercial reply in the same clarification thread", () => {
    expect(unreviewedDecisionEvidence(state({ conversation: [clarification, answer, correction] })).map((m) => m.id)).toEqual(["a-2"]);
  });

  it("ignores acknowledgements and proposal-page change requests", () => {
    const thanks = { ...correction, id: "a-thanks", text: "Thanks", classification: { kind: "acknowledgement" } };
    const proposal = { ...correction, id: "proposal-change", kind: "change_request", inReplyTo: "proposal-1", refs: { agreementVersion: 1 } };
    expect(unreviewedDecisionEvidence(state({ conversation: [clarification, answer, thanks, proposal] }))).toEqual([]);
  });

  it("a resolving disposition reviews only its referenced evidence and advances the snapshot", () => {
    const other = { ...correction, id: "a-3", createdAt: "2026-10-01T10:05:00+05:30", text: "There is one more correction." };
    const reviewed = state({
      conversation: [clarification, answer, correction, other],
      workDispositions: [{ id: "work-1", sourceKind: "message", sourceId: "a-2", kind: "keep_current_terms", note: "Confirmed by phone", actor: "merchant", at: "2026-10-01T10:02:00+05:30" }],
    });
    expect(unreviewedDecisionEvidence(reviewed).map((m) => m.id)).toEqual(["a-3"]);
    expect(decisionEvidenceSnapshot(reviewed)).toEqual(["a-1", "a-2"]);
  });
});
