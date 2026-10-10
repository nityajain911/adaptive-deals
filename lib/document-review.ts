import type { EconomicsEvidenceDraft, EconomicsEvidenceProposal } from "@/commercial-memory/economics-draft";

export interface DocumentReviewSource {
  id: string;
  title: string;
  status: string;
  uploaded?: boolean;
}

export interface DocumentReview {
  activeDocuments: DocumentReviewSource[];
  historyDocuments: DocumentReviewSource[];
  defaultMessage: string;
  status: "idle" | "match" | "differences";
  message: string | null;
  changes: EconomicsEvidenceProposal[];
}

/** Presentation-only summary. Values, citations and document status remain owned by the existing evidence draft. */
export function documentReview({ sources, draft }: { sources: DocumentReviewSource[]; draft?: EconomicsEvidenceDraft | null }): DocumentReview {
  const activeDocuments = sources.filter((source) => source.status === "active");
  const historyDocuments = sources.filter((source) => source.status !== "active");
  const defaultMessage = `Your offers use prices and costs from ${activeDocuments.length} active business document${activeDocuments.length === 1 ? "" : "s"}.`;
  if (!draft) return { activeDocuments, historyDocuments, defaultMessage, status: "idle", message: null, changes: [] };

  const supported = draft.proposals.filter((proposal) => proposal.status === "supported");
  const changes = supported.filter((proposal) => proposal.proposedValue !== proposal.currentValue);
  if (!changes.length) {
    return {
      activeDocuments,
      historyDocuments,
      defaultMessage,
      status: "match",
      message: `${supported.length} value${supported.length === 1 ? "" : "s"} found. All already match your saved prices and costs.`,
      changes,
    };
  }
  return {
    activeDocuments,
    historyDocuments,
    defaultMessage,
    status: "differences",
    message: `${changes.length} change${changes.length === 1 ? "" : "s"} found.`,
    changes,
  };
}
