import type { DealProgress } from "./progress";

export type DealStatusTone = "amber" | "blue" | "green" | "neutral";
export interface DealStatus {
  label: string;
  tone: DealStatusTone;
  /** What happens next, in the deal's own words; null when the deal has not started. */
  next: string | null;
}

/** One row's status on Active deals, from that deal's own saved progress. A deal that was never started says so and invents nothing. */
export function dealStatus(deal: { started: boolean; progress: DealProgress | null }): DealStatus {
  const { progress } = deal;
  if (!deal.started || !progress) return { label: "Not started", tone: "neutral", next: null };
  if (progress.kind === "terminal") return { label: progress.stages[progress.stage] === "completed" ? "Completed" : "Closed", tone: progress.stages[progress.stage] === "completed" ? "green" : "neutral", next: progress.headline };
  const WORD = { action_required: ["Your move", "amber"], waiting_on_buyer: ["Waiting on buyer", "blue"], waiting_on_system: ["Waiting on payment", "neutral"], informational: ["Up to date", "green"] } as const;
  const [label, tone] = WORD[progress.kind];
  return { label, tone, next: progress.headline };
}
