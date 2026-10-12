import type { CaseId, DemoCase } from "@/data/synthetic/cases";
import { dealStatus, type DealStatus } from "./deal-status";
import type { DealProgress } from "./progress";
import type { RunRecord } from "@/ai/run-record";
import { dealSituation, type SituationTile } from "./deal-situation";

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
  /** The buyer's situation as a few facts, each from a verified quote. */
  situation: SituationTile[];
  /** The conversation the situation was read from, as written. */
  messages: { id: string; author: "buyer" | "merchant"; text: string }[];
}

export function casePickerCards(cases: DemoCase[], activeId: CaseId, modelOutput: Record<CaseId, string>, progress: Partial<Record<CaseId, { started: boolean; progress: DealProgress | null }>> = {}, runs: Partial<Record<CaseId, RunRecord>> = {}, packageNames: Record<string, string> = {}): CasePickerCard[] {
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
      situation: runs[item.id] ? dealSituation({ quotePrePaise: item.quote.prePaise, profile: runs[item.id]!.engine.profile, rejectedFields: runs[item.id]!.engine.rejectedFields, packageNames }) : [],
      messages: item.deal.messages.map((message) => ({ id: message.id, author: message.author === "buyer" ? "buyer" : "merchant", text: message.text })),
    };
  });
}
