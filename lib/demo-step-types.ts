export type DemoStepType = "merchant" | "buyer" | "system";
export type SystemStepId = "pay_upfront_link" | "confirm_mandate" | "advance_to_notice" | "send_notice" | "collect_payment" | "advance_to_review";
export const SYSTEM_STEPS: readonly SystemStepId[] = ["pay_upfront_link", "confirm_mandate", "advance_to_notice", "send_notice", "collect_payment", "advance_to_review"];

export interface DemoStepShape {
  id: string;
  type: DemoStepType;
  label: string;
  href: string;
  systemAction: SystemStepId | null;
  usesReplyControl: boolean;
}

export function demoStepConsequence(step: Pick<DemoStepShape, "type" | "label">): string {
  const consequence = step.label.replace(/^(Next:|Simulate:)\s*/i, "").replace(/^simulated\s+/i, "");
  const owner = step.type === "system" ? "Simulated system event" : step.type === "buyer" ? "Simulated buyer action" : "Merchant action";
  return `${owner} · ${consequence}`;
}
