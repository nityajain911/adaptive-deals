import type { CaseId, DemoCase } from "@/data/synthetic/cases";
import { dealStatus, type DealStatus } from "./deal-status";
import type { DealProgress } from "./progress";

export const CASE_SWITCH_NOTE = "The deal you leave keeps its progress.";

export interface CasePickerCard {
  id: CaseId;
  title: string;
  buyer: string;
  proposal: string;
  barrier: string;
  proofPoint: string;
  provenance: DemoCase["provenance"];
  /** Who produced this case's model-task outputs: a recorded model run or a hand-written sample. */
  modelOutput: string;
  /** The deal being worked on now. */
  current: boolean;
  started: boolean;
  status: DealStatus;
}

export function casePickerCards(cases: DemoCase[], activeId: CaseId, modelOutput: Record<CaseId, string>, progress: Partial<Record<CaseId, { started: boolean; progress: DealProgress | null }>> = {}): CasePickerCard[] {
  return cases.map((item) => {
    const listing = progress[item.id] ?? { started: item.id === activeId, progress: null };
    return {
      id: item.id,
      title: item.title,
      buyer: item.buyer.name,
      proposal: item.proposalSummary,
      barrier: item.barrier,
      proofPoint: item.proofPoint,
      provenance: item.provenance,
      modelOutput: modelOutput[item.id],
      current: item.id === activeId,
      started: listing.started,
      status: dealStatus(listing),
    };
  });
}
