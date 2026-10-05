import type { DemoStep, DemoStepType } from "./demo-steps";
import { nextDemoStep } from "./demo-steps";
import type { DealProgress } from "./progress";
import type { DemoState } from "./service";

export const WALKTHROUGH_VERSION = "buildathon.v1" as const;

export type WalkthroughCapability = "case_picker" | "current_offer" | "preventive_depth" | "live_customisation" | "negotiation" | "test_invoice";
export type WalkthroughActor = "merchant" | "buyer" | "system" | "ai" | "engine";
export type WalkthroughProvenance = "live_groq" | "live_groq_replay" | "synthetic_replay" | "saved_groq_exact_match" | "deterministic_engine" | "merchant" | "simulated_buyer" | "razorpay_test_mode";

export interface WalkthroughObjective {
  id: string;
  actor: WalkthroughActor;
  title: string;
  instruction: string;
  notice: string;
  href: string;
  anchorId: string;
  optional: boolean;
  capability: WalkthroughCapability;
}

export interface WalkthroughAction {
  id: string;
  actor: DemoStepType;
  type: DemoStepType;
  label: string;
  href: string;
  systemAction: DemoStep["systemAction"];
  usesReplyControl: boolean;
}

export interface WalkthroughView {
  version: typeof WALKTHROUGH_VERSION;
  objectives: WalkthroughObjective[];
  currentObjectiveId: string;
  completedObjectiveIds: string[];
  currentAction: WalkthroughAction | null;
  terminalOutcome: string | null;
  provenance: WalkthroughProvenance | null;
  stepLabel: string;
}

const SHIPPED_CAPABILITIES: ReadonlySet<WalkthroughCapability> = new Set(["case_picker", "current_offer", "preventive_depth"]);

const REGISTRY: readonly WalkthroughObjective[] = [
  {
    id: "choose_case",
    actor: "merchant",
    title: "Choose a buyer situation",
    instruction: "Choose one case to start the walkthrough.",
    notice: "Different buyer constraints lead to different commercial decisions.",
    href: "/deals",
    anchorId: "case-picker",
    optional: false,
    capability: "case_picker",
  },
  {
    id: "understand_buyer",
    actor: "ai",
    title: "Understand the buyer",
    instruction: "Review the extracted constraints, evidence and questions, then complete the merchant action in the product.",
    notice: "AI structures the conversation; code preserves uncertainty and evidence.",
    href: "/deals/:dealId/understand",
    anchorId: "buyer-conversation",
    optional: false,
    capability: "current_offer",
  },
  {
    id: "review_decision",
    actor: "engine",
    title: "Review the commercial decision",
    instruction: "Review the recommendation and preview the buyer proposal in the product.",
    notice: "AI explains the choice; deterministic code calculates feasibility and economics.",
    href: "/deals/:dealId/offer",
    anchorId: "commercial-recommendation",
    optional: false,
    capability: "current_offer",
  },
  {
    id: "confirm_terms",
    actor: "merchant",
    title: "Confirm the exact terms",
    instruction: "Complete the human approval or acceptance shown in the product.",
    notice: "The merchant and buyer act on the same versioned terms.",
    href: "/deals/:dealId/track",
    anchorId: "final-terms",
    optional: false,
    capability: "current_offer",
  },
  {
    id: "setup_collection",
    actor: "system",
    title: "Set up collection",
    instruction: "Run the labelled buyer or system setup event.",
    notice: "Collection starts only after the buyer accepts the terms.",
    href: "/deals/:dealId/track",
    anchorId: "collection-setup",
    optional: true,
    capability: "preventive_depth",
  },
  {
    id: "preventive_restructure",
    actor: "system",
    title: "Explore preventive restructuring",
    instruction: "Follow the notice and change-request flow without waiting for a failed debit.",
    notice: "The product rechecks the revised schedule before either party approves it.",
    href: "/deals/:dealId/track",
    anchorId: "collection-setup",
    optional: true,
    capability: "preventive_depth",
  },
];

export function walkthroughCapabilities(): ReadonlySet<WalkthroughCapability> {
  return new Set(SHIPPED_CAPABILITIES);
}

function action(step: DemoStep | null, dealId: string): WalkthroughAction | null {
  if (!step) return null;
  return { ...step, actor: step.type, href: step.href.replace(":dealId", dealId) };
}

function objectiveFor(progress: DealProgress): string {
  if (progress.rule.startsWith("understand.") || progress.rule === "review.required") return "understand_buyer";
  if (progress.rule.startsWith("offer.")) return "review_decision";
  if (progress.rule === "track.sent_awaiting_buyer" || progress.rule === "track.terminal") return "confirm_terms";
  if (progress.rule === "track.buyer_setup") return "setup_collection";
  return "preventive_restructure";
}

function outcome(state: DemoState, progress: DealProgress): string | null {
  if (progress.rule === "offer.no_feasible") return "No offer fits the buyer's confirmed limits and the merchant's current rules.";
  if (progress.rule === "offer.outside_templates") return "This request needs a custom arrangement outside the approved templates.";
  if (progress.rule === "offer.closed" || state.status === "merchant_rejected") return "Closed in Adaptive Deals by the merchant.";
  if (progress.rule === "track.terminal" && state.status === "buyer_rejected") return "Buyer declined the offer.";
  if (progress.rule === "track.terminal") return progress.headline;
  return null;
}

function runProvenance(state: DemoState): WalkthroughProvenance {
  if (state.run.record.kind === "synthetic_replay") return "synthetic_replay";
  return state.run.viewing === "fresh" ? "live_groq" : "live_groq_replay";
}

function provenanceFor(objectiveId: string, state: DemoState): WalkthroughProvenance | null {
  if (objectiveId === "choose_case") return "merchant";
  if (objectiveId === "understand_buyer") return runProvenance(state);
  if (objectiveId === "review_decision") return "deterministic_engine";
  if (objectiveId === "confirm_terms") return "merchant";
  if (objectiveId === "setup_collection" || objectiveId === "preventive_restructure") return "simulated_buyer";
  return null;
}

export function walkthroughView({ state, progress, dealId, capabilities }: { state: DemoState; progress: DealProgress; dealId: string; capabilities: ReadonlySet<WalkthroughCapability> }): WalkthroughView {
  const objectives = REGISTRY.filter((item) => capabilities.has(item.capability)).map((item) => ({ ...item, href: item.href.replace(":dealId", dealId) }));
  const started = state.events.some((event) => event.kind === "case_started");
  const currentObjectiveId = started ? objectiveFor(progress) : "choose_case";
  const currentIndex = objectives.findIndex((item) => item.id === currentObjectiveId);
  const completedObjectiveIds = objectives.slice(0, Math.max(0, currentIndex)).map((item) => item.id);
  const core = objectives.filter((item) => !item.optional);
  const coreIndex = core.findIndex((item) => item.id === currentObjectiveId);
  const stepLabel = coreIndex >= 0 ? `Step ${coreIndex + 1} of ${core.length}` : "Explore another product capability";
  const caseAction: WalkthroughAction = {
    id: "choose_case",
    actor: "merchant",
    type: "merchant",
    label: "Choose a case in the product",
    href: "/deals",
    systemAction: null,
    usesReplyControl: false,
  };

  return {
    version: WALKTHROUGH_VERSION,
    objectives,
    currentObjectiveId,
    completedObjectiveIds,
    currentAction: started ? action(nextDemoStep(state, progress, dealId), dealId) : caseAction,
    terminalOutcome: started ? outcome(state, progress) : null,
    provenance: provenanceFor(currentObjectiveId, state),
    stepLabel,
  };
}
