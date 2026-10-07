import type { DemoStep, DemoStepType } from "./demo-steps";
import { demoStepConsequence, nextDemoStep } from "./demo-steps";
import type { DealProgress } from "./progress";
import { demoCase } from "@/data/synthetic/cases";
import { branchCause } from "./decision-branch";
import { taskOrRunProvenance, type ModelProvenance } from "./model-provenance";
import type { DemoState } from "./service";
import { WALKTHROUGH_VERSION } from "./walkthrough-version";
export { WALKTHROUGH_VERSION } from "./walkthrough-version";

export type WalkthroughCapability = "business_economics" | "case_picker" | "current_offer" | "preventive_depth" | "live_customisation" | "negotiation" | "test_invoice";
export type WalkthroughActor = "merchant" | "buyer" | "system" | "ai" | "sample" | "engine";
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

export interface WalkthroughSubStep {
  label: string;
  state: "done" | "current" | "todo";
}

/** How the walkthrough ends: what happened, written by code from stored state and without amounts. */
export interface WalkthroughFinish {
  title: string;
  lines: string[];
}

export interface WalkthroughAction {
  id: string;
  actor: DemoStepType;
  type: DemoStepType;
  label: string;
  href: string;
  systemAction: DemoStep["systemAction"];
  usesReplyControl: boolean;
  consequence: string;
  /** The label on the product's own button the person must click; null for simulated events. */
  productLabel: string | null;
}

export interface WalkthroughView {
  version: typeof WALKTHROUGH_VERSION;
  objectives: WalkthroughObjective[];
  currentObjectiveId: string;
  completedObjectiveIds: string[];
  currentAction: WalkthroughAction | null;
  terminalOutcome: string | null;
  provenance: WalkthroughProvenance | null;
  /** Display text for `provenance`; run-derived text names the actual source of the outputs. */
  provenanceLabel: string | null;
  stepLabel: string;
  /** The actions inside the current stage, when it has more than one. */
  subSteps: WalkthroughSubStep[] | null;
  /** Set only when there is nothing left to do. */
  finish: WalkthroughFinish | null;
}

const SHIPPED_CAPABILITIES: ReadonlySet<WalkthroughCapability> = new Set(["business_economics", "case_picker", "current_offer", "preventive_depth", "negotiation"]);

const REGISTRY: readonly WalkthroughObjective[] = [
  {
    id: "business_economics",
    actor: "merchant",
    title: "Set your business economics",
    instruction: "Review the delivery costs and rules every recommended offer must respect. Change a cost, or load the illustrative example, then review and activate it yourself.",
    notice: "Code checks every offer against these rules before you see it. The guide never activates anything for you.",
    href: "/economics",
    anchorId: "economics-page",
    optional: false,
    capability: "business_economics",
  },
  {
    id: "choose_case",
    actor: "merchant",
    title: "Choose a buyer situation",
    instruction: "Pick a buyer situation to start.",
    notice: "Different buyer constraints lead to different commercial decisions.",
    href: "/deals",
    anchorId: "case-picker",
    optional: false,
    capability: "case_picker",
  },
  {
    id: "understand_buyer",
    actor: "sample",
    title: "Understand the buyer",
    instruction: "Check what was understood from the buyer's words.",
    notice: "Code preserves uncertainty and evidence.",
    href: "/deals/:dealId/understand",
    anchorId: "buyer-conversation",
    optional: false,
    capability: "current_offer",
  },
  {
    id: "review_decision",
    actor: "engine",
    title: "Review the commercial decision",
    instruction: "Review the recommendation. You can choose a different offer.",
    notice: "Deterministic code calculates feasibility and economics.",
    href: "/deals/:dealId/offer",
    anchorId: "commercial-recommendation",
    optional: false,
    capability: "current_offer",
  },
  {
    id: "confirm_terms",
    actor: "merchant",
    title: "Confirm the exact terms",
    instruction: "Both sides approve the same version of the terms.",
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
    instruction: "Simulate the buyer setting up payment.",
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
    instruction: "See what happens when the buyer asks to move a payment.",
    notice: "The product rechecks the revised schedule before either party approves it.",
    href: "/deals/:dealId/track",
    anchorId: "collection-setup",
    optional: true,
    capability: "preventive_depth",
  },
  {
    id: "negotiate_price",
    actor: "merchant",
    title: "Answer a buyer's price request",
    instruction: "Before a fresh deal, open Business economics, load the illustrative example, then review and activate it yourself. When the buyer asks for a lower price, choose how to answer in the corridor.",
    notice: "The corridor is calculated by code from your own rules. The guide never activates economics or sends an offer for you.",
    href: "/deals/:dealId/track",
    anchorId: "negotiation-corridor",
    optional: true,
    capability: "negotiation",
  },
];

export function walkthroughCapabilities(): ReadonlySet<WalkthroughCapability> {
  return new Set(SHIPPED_CAPABILITIES);
}

/** Buttons the progress derivation does not name: the buyer's own page and the preview. */
const PRODUCT_LABEL: Record<string, string> = {
  approve_and_send_draft: "Approve and send to buyer",
  buyer_accept: "Accept proposal",
  buyer_accept_revision: "Accept revised proposal",
};

function action(step: DemoStep | null, dealId: string, progress: DealProgress): WalkthroughAction | null {
  if (!step) return null;
  const productLabel = PRODUCT_LABEL[step.id] ?? (step.type === "merchant" ? (progress.primaryAction?.label ?? null) : null);
  return { ...step, actor: step.type, href: step.href.replace(":dealId", dealId), consequence: demoStepConsequence(step), productLabel };
}

const UNDERSTAND_STEPS = ["Send the questions", "Buyer answers", "Use the answers"];
const OFFER_STEPS = ["Choose the offer", "Preview and send"];
const SETUP_STEPS = ["Buyer pays the upfront link", "Buyer authorises recurring payments"];

const track = (labels: string[], current: number): WalkthroughSubStep[] => labels.map((label, i) => ({ label, state: i < current ? "done" : i === current ? "current" : "todo" }));

const hasDraft = (state: DemoState) => !!state.selectedOption?.draftVersion && state.agreements.some((a) => a.version === state.selectedOption?.draftVersion && a.status === "draft");

function subSteps(state: DemoState, progress: DealProgress): WalkthroughSubStep[] | null {
  switch (progress.rule) {
    case "understand.send":
      return track(UNDERSTAND_STEPS, 0);
    case "understand.waiting":
    case "understand.interpret":
      return track(UNDERSTAND_STEPS, 1);
    case "understand.use_answers":
      return track(UNDERSTAND_STEPS, 2);
    case "offer.review":
    case "offer.stale":
      return track(OFFER_STEPS, progress.rule === "offer.review" && hasDraft(state) ? 1 : 0);
    case "track.buyer_setup":
      return track(SETUP_STEPS, state.attempts.some((a) => a.method === "payment_link" && a.status === "scheduled") ? 0 : 1);
    default:
      return null;
  }
}

/** The ending, built from stored state only. Amounts stay out of the guide. */
function finish(state: DemoState, progress: DealProgress, hasAction: boolean, terminal: string | null): WalkthroughFinish | null {
  if (hasAction) return null;
  const amended = state.amendments.at(-1);
  const completed = terminal !== null || progress.rule === "track.fully_paid" || amended?.state === "active";
  if (!completed) return null;
  const lines: string[] = [];
  const title = demoCase(state.caseId)?.title;
  if (title) lines.push(`You walked through: ${title}.`);
  lines.push(`Buyer constraints came from: ${taskSource(state, "extract").label}.`);
  const decisions: string[] = [];
  if (state.decisionBranch?.scope) decisions.push("confirmed the required services");
  if (state.outcomes.some((o) => o.type === "option_selected" && o.source?.kind === "action")) decisions.push("chose your own offer");
  for (const v of state.agreements) if (v.merchantApproval) decisions.push(`approved version ${v.version}`);
  if (decisions.length) lines.push(`Your decisions: ${decisions.join(", ")}.`);
  if (terminal) lines.push(terminal);
  else if (amended?.state === "active") lines.push(`A payment was moved to a later date after both sides approved version ${amended.toVersion}.`);
  else lines.push("Every scheduled payment was collected.");
  return { title: terminal ? "Walkthrough ended" : "Walkthrough complete", lines };
}

function objectiveFor(progress: DealProgress, state: DemoState): string {
  if (progress.rule === "track.buyer_request" && state.conversation.some((m) => m.kind === "change_request" && m.refs?.topic === "price")) return "negotiate_price";
  if (progress.rule === "review.required") return progress.stage === "understand" ? "understand_buyer" : "review_decision";
  if (progress.rule.startsWith("understand.")) return "understand_buyer";
  if (progress.rule.startsWith("offer.")) return "review_decision";
  if (progress.rule === "track.sent_awaiting_buyer" || progress.rule === "track.terminal") return "confirm_terms";
  if (progress.rule === "track.buyer_setup") return "setup_collection";
  return "preventive_restructure";
}

function outcome(state: DemoState, progress: DealProgress): string | null {
  if (progress.rule === "offer.no_feasible") return "No offer fits the buyer's confirmed limits and the merchant's current rules.";
  if (progress.rule === "offer.outside_templates") return "This request needs a custom arrangement outside your approved offer types.";
  if (progress.rule === "offer.closed" || state.status === "merchant_rejected") return "Closed in Adaptive Deals by the merchant.";
  if (progress.rule === "track.terminal" && state.status === "buyer_rejected") return "Buyer declined the offer.";
  if (progress.rule === "track.terminal") return progress.headline;
  return null;
}

const RUN_PROVENANCE: Record<ModelProvenance["source"], WalkthroughProvenance> = { hand_written: "synthetic_replay", mixed: "synthetic_replay", recorded_model: "live_groq_replay", live_model: "live_groq" };

const PROVENANCE_LABEL: Record<Exclude<WalkthroughProvenance, "live_groq" | "live_groq_replay" | "synthetic_replay">, string> = {
  saved_groq_exact_match: "Saved Groq response · exact input match",
  deterministic_engine: "Deterministic engine calculation",
  merchant: "Merchant decision",
  simulated_buyer: "Simulated buyer action",
  razorpay_test_mode: "Razorpay Test Mode",
};

/** The stored step behind each model-task objective: extraction for Understand, ranking for the decision. */
const taskSource = (state: DemoState, task: "extract" | "explain") => taskOrRunProvenance(state.run.record, task, state.run.viewing);

function runProvenance(state: DemoState): WalkthroughProvenance {
  return RUN_PROVENANCE[taskSource(state, "extract").source];
}

function provenanceLabel(provenance: WalkthroughProvenance | null, state: DemoState): string | null {
  if (provenance === null) return null;
  if (provenance === "live_groq" || provenance === "live_groq_replay" || provenance === "synthetic_replay") return taskSource(state, "extract").label;
  return PROVENANCE_LABEL[provenance];
}

/** Model-task steps are described by who actually produced this run's outputs. */
function attributed(item: WalkthroughObjective, state: DemoState): WalkthroughObjective {
  if (item.id === "understand_buyer") {
    const source = taskSource(state, "extract");
    return source.modelMade
      ? { ...item, actor: "ai", notice: `${source.providerName} structures the conversation; code preserves uncertainty and evidence.` }
      : { ...item, actor: "sample", notice: "The structured constraints in this case are sample output written by hand; no model ran. Code preserves uncertainty and evidence." };
  }
  if (item.id === "review_decision") {
    if (state.decisionBranch) return { ...item, notice: `The engine recalculated this decision after ${branchCause(state.decisionBranch)}; code set the order and wrote the explanation.` };
    const source = taskSource(state, "explain");
    return source.modelMade
      ? { ...item, notice: "You choose the strategy; deterministic code ranks the feasible offers and calculates every figure. The recorded model order is kept as evidence only." }
      : { ...item, notice: "You choose the strategy; deterministic code ranks the feasible offers and calculates every figure. The sample order in this case was written by hand; no model ran, and it is kept as evidence only." };
  }
  return item;
}

function provenanceFor(objectiveId: string, state: DemoState): WalkthroughProvenance | null {
  if (objectiveId === "choose_case" || objectiveId === "business_economics") return "merchant";
  if (objectiveId === "understand_buyer") return runProvenance(state);
  if (objectiveId === "review_decision") return "deterministic_engine";
  if (objectiveId === "confirm_terms") return "merchant";
  if (objectiveId === "setup_collection" || objectiveId === "preventive_restructure") return "simulated_buyer";
  if (objectiveId === "negotiate_price") return "merchant";
  return null;
}

export function walkthroughView({ state, progress, dealId, capabilities, route }: { state: DemoState; progress: DealProgress; dealId: string; capabilities: ReadonlySet<WalkthroughCapability>; route?: "economics" }): WalkthroughView {
  const objectives = REGISTRY.filter((item) => capabilities.has(item.capability)).map((item) => attributed({ ...item, href: item.href.replace(":dealId", dealId) }, state));
  const started = state.events.some((event) => event.kind === "case_started");
  const currentObjectiveId = started ? objectiveFor(progress, state) : route === "economics" && capabilities.has("business_economics") ? "business_economics" : "choose_case";
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
    consequence: "Merchant action · choose a case in the product",
    productLabel: "Start this case",
  };

  const economicsAction: WalkthroughAction = {
    id: "business_economics",
    actor: "merchant",
    type: "merchant",
    label: "Review your business economics",
    href: "/economics",
    systemAction: null,
    usesReplyControl: false,
    consequence: "Merchant action · set the rules every recommendation must respect",
    productLabel: "Review changes",
  };
  const provenance = provenanceFor(currentObjectiveId, state);
  const currentAction = started ? action(nextDemoStep(state, progress, dealId), dealId, progress) : currentObjectiveId === "business_economics" ? economicsAction : caseAction;
  const terminalOutcome = started ? outcome(state, progress) : null;

  return {
    version: WALKTHROUGH_VERSION,
    objectives,
    currentObjectiveId,
    completedObjectiveIds,
    currentAction,
    terminalOutcome,
    provenance,
    provenanceLabel: provenanceLabel(provenance, state),
    stepLabel,
    subSteps: started ? subSteps(state, progress) : null,
    finish: started ? finish(state, progress, currentAction !== null, terminalOutcome) : null,
  };
}
