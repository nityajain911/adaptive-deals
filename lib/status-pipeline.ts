import type { DealProgress, StageId, StageStatus } from "./progress";

export interface PipelineStep {
  id: StageId;
  label: string;
  status: StageStatus;
  current: boolean;
}

const TRACK_LABEL: Record<DealProgress["kind"], string> = {
  action_required: "Needs your reply",
  waiting_on_buyer: "Waiting on buyer",
  waiting_on_system: "Awaiting payment",
  informational: "Collecting payments",
  terminal: "Closed",
};

/**
 * The compact status line above a deal: Issue understood → Offer sent → Waiting on buyer.
 * Every label is derived from `dealProgress`, never from pages visited, so it cannot say more than is true.
 */
export function statusPipeline(progress: DealProgress): PipelineStep[] {
  const labelFor = (id: StageId, status: StageStatus): string => {
    if (status === "closed") return "Closed";
    if (status === "completed") return "Completed";
    if (id === "understand") return status === "done" ? "Issue understood" : status === "current" ? "Understanding the buyer" : "Understand the buyer";
    if (id === "offer") return status === "done" ? "Offer sent" : status === "current" ? "Reviewing the offer" : "Offer";
    return status === "current" ? TRACK_LABEL[progress.kind] : "Track the deal";
  };
  return (["understand", "offer", "track"] as const).map((id) => {
    const status = progress.stages[id];
    const current = status === "current" || ((status === "closed" || status === "completed") && progress.stage === id);
    return { id, label: labelFor(id, status), status, current };
  });
}
