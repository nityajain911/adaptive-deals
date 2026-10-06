import type { DealEvaluation } from "./engine";

export type DealStatus =
  | "stalled"
  | "clarifying"
  | "options_ready"
  | "approved"
  | "sent"
  | "accepted"
  | "active"
  | "amending"
  | "completed"
  | "needs_information"
  | "outside_templates"
  | "no_feasible_structure"
  | "merchant_rejected"
  | "buyer_rejected"
  | "cancelled";

const EXITS: DealStatus[] = ["cancelled"];

export const DEAL_TRANSITIONS: Record<DealStatus, DealStatus[]> = {
  stalled: ["clarifying", "options_ready", "needs_information", "outside_templates", "no_feasible_structure", ...EXITS],
  clarifying: ["clarifying", "options_ready", "needs_information", "outside_templates", "no_feasible_structure", ...EXITS],
  needs_information: ["clarifying", "options_ready", "needs_information", "no_feasible_structure", ...EXITS],
  outside_templates: ["clarifying", "options_ready", "needs_information", "no_feasible_structure", "merchant_rejected", ...EXITS],
  no_feasible_structure: ["clarifying", "options_ready", "merchant_rejected", ...EXITS],
  options_ready: ["approved", "merchant_rejected", "clarifying", ...EXITS],
  approved: ["sent", "merchant_rejected", ...EXITS],
  sent: ["accepted", "buyer_rejected", "options_ready", ...EXITS],
  accepted: ["active", ...EXITS],
  active: ["amending", "completed", ...EXITS],
  amending: ["active", ...EXITS],
  completed: [],
  merchant_rejected: ["options_ready", ...EXITS],
  buyer_rejected: ["options_ready", ...EXITS],
  cancelled: [],
};

export function assertDealTransition(from: DealStatus, to: DealStatus): void {
  if (!DEAL_TRANSITIONS[from].includes(to)) throw new Error(`Deal cannot move from ${from} to ${to}`);
}

/** Map an engine evaluation onto the deal status vocabulary. */
export function statusForEvaluation(e: DealEvaluation): DealStatus {
  switch (e.state) {
    case "options_ready":
      return "options_ready";
    case "ambiguous":
      return "clarifying";
    case "insufficient_information":
      return "needs_information";
    case "outside_templates":
      return "outside_templates";
    case "no_feasible_deal":
      return "no_feasible_structure";
  }
}
