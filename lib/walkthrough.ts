import type { DemoStep, DemoStepType } from "./demo-steps";
import { demoStepConsequence, nextDemoStep } from "./demo-steps";
import type { DealProgress } from "./progress";
import { demoCase } from "@/data/synthetic/cases";
import { branchCause } from "./decision-branch";
import { taskOrRunProvenance, type ModelProvenance } from "./model-provenance";
import type { DemoState } from "./service";
import { WALKTHROUGH_VERSION } from "./walkthrough-version";
export { WALKTHROUGH_VERSION } from "./walkthrough-version";

export type WalkthroughCapability = "business_economics" | "case_picker" | "current_offer" | "preventive_depth" | "live_customisation" | "negotiation" | "test_invoice" | "follow_on";
export type WalkthroughActor = "merchant" | "buyer" | "system" | "ai" | "sample" | "engine";
export type WalkthroughProvenance = "live_model" | "recorded_model" | "synthetic_replay" | "saved_groq_exact_match" | "deterministic_engine" | "merchant" | "simulated_buyer" | "razorpay_test_mode";

export interface WalkthroughObjective {
  id: string;
  actor: WalkthroughActor;
  title: string;
  instruction: string;
  notice: string;
  /** The one-line point of this step, written for the person watching the demo. */
  pitch?: string;
  /** What to look for, in one line. */
  watch?: string;
  /** How this step is built, in plain words; true of the code that runs. */
  architecture?: string;
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

const SHIPPED_CAPABILITIES: ReadonlySet<WalkthroughCapability> = new Set(["business_economics", "case_picker", "current_offer", "preventive_depth", "negotiation", "follow_on"]);

const REGISTRY: readonly WalkthroughObjective[] = [
  {
    id: "business_economics",
    actor: "merchant",
    title: "Set your prices & costs",
    pitch: "Your rules come first",
    watch: "Every offer is checked against your prices, costs and limits before you see it.",
    architecture: "Prices and costs are saved as numbered versions; each deal is checked against the version it started with.",
    instruction: "Look at the prices and costs your offers are worked out from. Change one, or try the example that allows discounts, then check and save it yourself.",
    notice: "Every offer is checked against these before you see it. The guide never saves anything for you.",
    href: "/economics",
    anchorId: "economics-page",
    optional: false,
    capability: "business_economics",
  },
  {
    id: "choose_case",
    actor: "merchant",
    title: "Choose a buyer situation",
    pitch: "Every buyer needs a different answer",
    watch: "Three situations: a buyer who wants to start small, one who asks for a discount, and one with no fit.",
    architecture: "Each situation replays a recorded model reading of its own conversation, with a labelled hand-written sample as the fallback.",
    instruction: "Pick a buyer situation to start.",
    notice: "Different customers need different answers.",
    href: "/deals",
    anchorId: "case-picker",
    optional: false,
    capability: "case_picker",
  },
  {
    id: "understand_buyer",
    actor: "sample",
    title: "Understand the buyer",
    pitch: "What the buyer said, with proof",
    watch: "Every fact is tied to a quote in the chat; nothing the buyer did not say is shown.",
    architecture: "A model (Cerebras, recorded) reads the chat as words and quotes. Code keeps only what it finds in the buyer's own messages.",
    instruction: "Check what was understood from the buyer's words.",
    notice: "The app keeps track of what the buyer said and what is still unclear.",
    href: "/deals/:dealId/understand",
    anchorId: "buyer-conversation",
    optional: false,
    capability: "current_offer",
  },
  {
    id: "review_decision",
    actor: "engine",
    title: "Review the commercial decision",
    pitch: "A sale you can afford to make",
    watch: "Offers are ranked against your limits, and what you keep is shown before you send.",
    architecture: "Code lists and ranks every offer against your limits. No model writes a figure.",
    instruction: "Review the recommendation. You can choose a different offer.",
    notice: "The app, not AI, works out every figure and checks every limit.",
    href: "/deals/:dealId/offer",
    anchorId: "commercial-recommendation",
    optional: false,
    capability: "current_offer",
  },
  {
    id: "confirm_terms",
    actor: "buyer",
    title: "Buyer accepts and collection begins",
    pitch: "Both sides agree the same terms",
    watch: "The buyer accepts exactly what you sent, and collection starts only after that.",
    architecture: "Both acceptances are bound to the same SHA-256 terms hash. Payment and auto-pay are simulated.",
    instruction: "Let the buyer accept the exact offer, then see the collection setup.",
    notice: "The buyer accepts the same terms you sent. Collection starts only after that.",
    href: "/deals/:dealId/track",
    anchorId: "final-terms",
    optional: false,
    capability: "current_offer",
  },
  {
    id: "month_three_review",
    actor: "merchant",
    title: "The month-three review",
    pitch: "Two phases, and the deal closes in the second",
    watch: "The rest of the year was held in the terms both sides approved. It is sent only after the first phase is paid, and only while the held price is open.",
    architecture: "The held offer is part of the terms hash. The buyer's answer is read by Cerebras (recorded once) and checked by code against their own words: the amount, the date and the service. At the review the same engine checks the held offer again, and it goes out as its own version with its own payment setup.",
    instruction: "Move to the review date, let the buyer say what they want (carry on, ask for a change, or stop), act on their answer, then let them accept and pay or stop here.",
    notice: "The buyer can stop here at no cost. Nothing is collected for the rest of the year unless they accept it. There is no third phase.",
    href: "/deals/:dealId/track",
    anchorId: "collection-setup",
    optional: false,
    capability: "follow_on",
  },
  {
    id: "preventive_restructure",
    actor: "system",
    title: "Explore preventive restructuring",
    pitch: "Fix a late payment before it happens",
    watch: "When the buyer asks for time, the schedule, profit and mandate are rechecked before either side agrees.",
    architecture: "A fixed set of date phrases is read by rules; anything else needs you. A change is a new version both sides accept.",
    instruction: "Move to the advance-notice date, let the buyer ask for more time, then draft, approve and send the revised terms and let them accept.",
    notice: "The app checks the new schedule before either side agrees.",
    href: "/deals/:dealId/track",
    anchorId: "collection-setup",
    optional: true,
    capability: "preventive_depth",
  },
  {
    id: "no_fit",
    actor: "engine",
    title: "Explore when no offer fits",
    pitch: "Saying no, with a reason",
    watch: "When nothing fits your rules, the app names the rule that blocks it instead of inventing an offer.",
    architecture: "The rules engine evaluates every possible offer and reports the checks each one fails.",
    instruction: "See why the buyer's request cannot be offered within your current rules.",
    notice: "No offer is recommended when the buyer's needs and your rules do not safely fit together.",
    href: "/deals/:dealId/offer",
    anchorId: "commercial-recommendation",
    optional: true,
    capability: "current_offer",
  },
  {
    id: "negotiate_price",
    actor: "merchant",
    title: "Answer a buyer's price request",
    pitch: "Your margin holds under pressure",
    watch: "A price request is answered from your own limits; a smaller scope is offered only if it passes every rule.",
    architecture: "The rules engine works out the lowest price and the smaller scope. No model writes a figure, and you approve and send.",
    instruction: "The buyer asked for a lower price. Choose how to answer: hold firm, offer a smaller scope that passes every rule, or set your own amount.",
    notice: "The lowest price and the discounts come from your own limits. The guide never saves your prices or sends an offer for you.",
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
  approve_and_send_draft: "Send offer",
  select_discounted_offer: "Use this instead",
  buyer_accept: "Accept and pay",
  buyer_decide: "Accept and pay",
  buyer_setup: "Pay and set up auto-pay",
  buyer_accept_revision: "Accept revised proposal",
};

function action(step: DemoStep | null, dealId: string, progress: DealProgress): WalkthroughAction | null {
  if (!step) return null;
  // A change at the review is answered on the offer screen, where the button is "Send to the buyer".
  const productLabel = (progress.rule === "track.follow_on_changes" && step.id === "send_follow_on" ? "Send to the buyer" : null) ?? (progress.rule === "track.amendment_merchant" && step.id === "review_revised_terms" ? "Approve the new terms" : null) ?? PRODUCT_LABEL[step.id] ?? (step.type === "merchant" ? (progress.primaryAction?.label ?? null) : null);
  return { ...step, actor: step.type, href: step.href.replace(":dealId", dealId), consequence: demoStepConsequence(step), productLabel };
}

const UNDERSTAND_STEPS = ["Send the questions", "Buyer answers"];
const OFFER_STEPS = ["Choose the offer", "Preview and send"];
const SETUP_STEPS = ["Buyer pays and sets up auto-pay"];

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
      return track(SETUP_STEPS, 0);
    default:
      return null;
  }
}

/** The ending, built from stored state only. Amounts stay out of the guide. */
function finish(state: DemoState, progress: DealProgress, hasAction: boolean, terminal: string | null): WalkthroughFinish | null {
  if (hasAction) return null;
  const amended = state.amendments.at(-1);
  const completed = terminal !== null || progress.rule === "track.fully_paid" || amended?.state === "active" || state.agreements.some((v) => v.continuesFrom && v.status === "active");
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
  else {
    // The rest of the year is paid in three; the guide ends when it is accepted, so say what is still to come rather than that all is collected.
    const sold = state.followOnSale ? state.agreements.find((v) => v.version === state.followOnSale!.version) : null;
    const remaining = sold?.status === "active" ? state.attempts.filter((a) => a.agreementVersion === sold.version && a.status === "scheduled") : [];
    lines.push(remaining.length ? `The first payment of the rest of the year was collected; the other ${remaining.length === 1 ? "payment is" : `${remaining.length} payments are`} taken automatically on ${remaining.length === 1 ? "its date" : "their dates"}.` : "Every scheduled payment was collected.");
  }
  if (state.followOnClosed && state.followOnClosed.reason !== "buyer_stopped") lines.push("After the review you did not send the rest of the year, because their condition was not met. The deal closes after the first phase.");
  if (state.followOnSale) {
    const sold = state.agreements.find((v) => v.version === state.followOnSale!.version);
    lines.push(sold?.status === "buyer_rejected"
      ? `After the review, the rest of the year went out as version ${sold.version} and the buyer chose to stop here. The deal closes after the first phase.`
      : `After the review, the rest of the year went out as version ${state.followOnSale.version} and the buyer accepted it. It is the second and last phase.`);
  }
  return { title: terminal ? "Walkthrough ended" : "Walkthrough complete", lines };
}

function objectiveFor(progress: DealProgress, state: DemoState): string {
  if (progress.rule === "track.stopped_after_first" || progress.rule.startsWith("track.follow_on") || (state.followOnSale && progress.rule.startsWith("track."))) return "month_three_review";
  if (progress.rule === "track.next_payment" && state.amendments.at(-1)?.state === "active" && nextDemoStep(state, progress, "x")?.id === "collect_payment") return "month_three_review";
  if (progress.rule === "track.buyer_request" && state.conversation.some((m) => m.kind === "change_request" && m.refs?.topic === "price")) return "negotiate_price";
  if (progress.rule === "offer.no_feasible") return "no_fit";
  if (progress.rule === "review.required") return progress.stage === "understand" ? "understand_buyer" : "review_decision";
  if (progress.rule.startsWith("understand.")) return "understand_buyer";
  if (progress.rule.startsWith("offer.")) return "review_decision";
  if (progress.rule === "track.sent_awaiting_buyer" || progress.rule === "track.terminal") return "confirm_terms";
  if (progress.rule === "track.buyer_setup") return "confirm_terms";
  return "preventive_restructure";
}

function outcome(state: DemoState, progress: DealProgress): string | null {
  if (progress.rule === "offer.no_feasible") return "No offer fits the buyer's confirmed limits and the merchant's current rules.";
  if (progress.rule === "offer.outside_templates") return "This request needs a custom arrangement outside your approved offer types.";
  if (progress.rule === "offer.closed" || state.status === "merchant_rejected") return "Closed in Adaptive Deals by the merchant.";
  if (progress.rule === "track.stopped_after_first") return "The buyer chose to stop after the first phase. Nothing more is due.";
  if (progress.rule === "track.follow_on_closed") return state.followOnClosed?.reason === "buyer_stopped" ? "The buyer chose to stop after the pilot, and you closed the deal. Nothing more is due." : "You chose not to send the rest of the year because their condition was not met. Nothing more is due.";
  if (progress.rule === "track.terminal" && state.status === "buyer_rejected") return "Buyer declined the offer.";
  if (progress.rule === "track.terminal") return progress.headline;
  return null;
}

const RUN_PROVENANCE: Record<ModelProvenance["source"], WalkthroughProvenance> = { hand_written: "synthetic_replay", mixed: "synthetic_replay", recorded_model: "recorded_model", live_model: "live_model" };

const PROVENANCE_LABEL: Record<Exclude<WalkthroughProvenance, "live_model" | "recorded_model" | "synthetic_replay">, string> = {
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
  if (provenance === "live_model" || provenance === "recorded_model" || provenance === "synthetic_replay") return taskSource(state, "extract").label;
  return PROVENANCE_LABEL[provenance];
}

/** Model-task steps are described by who actually produced this run's outputs. */
function attributed(item: WalkthroughObjective, state: DemoState): WalkthroughObjective {
  // Each case ends its story differently: the pilot with its month-three review, the discount with a balance that moves before it is late.
  // The one that ends this case's story is a step of the walkthrough; the other is optional exploration.
  const ending = demoCase(state.caseId)?.journeyEnd ?? "month_three_review";
  if (item.id === "month_three_review" || item.id === "preventive_restructure") item = { ...item, optional: item.id !== ending };
  if (item.id === "understand_buyer") {
    const source = taskSource(state, "extract");
    return source.modelMade
      ? { ...item, actor: "ai", notice: `${source.providerName} read the buyer's messages. The app keeps what is unclear and shows where each fact came from.` }
      : { ...item, actor: "sample", notice: "The buyer's details in this case were written by hand; no AI ran. The app keeps what is unclear and shows where each fact came from." };
  }
  if (item.id === "review_decision") {
    if (state.decisionBranch) return { ...item, notice: `The app worked this out again after ${branchCause(state.decisionBranch)}.` };
    const source = taskSource(state, "explain");
    return source.modelMade
      ? { ...item, notice: "You choose what matters most; the app picks the offers and works out every figure. A saved AI ranking is kept only as history." }
      : { ...item, notice: "You choose what matters most; the app picks the offers and works out every figure. This case's sample ranking was written by hand (no AI ran) and is kept only as history." };
  }
  return item;
}

function provenanceFor(objectiveId: string, state: DemoState): WalkthroughProvenance | null {
  if (objectiveId === "choose_case" || objectiveId === "business_economics") return "merchant";
  if (objectiveId === "understand_buyer") return runProvenance(state);
  if (objectiveId === "review_decision") return "deterministic_engine";
  if (objectiveId === "confirm_terms") return "merchant";
  if (objectiveId === "preventive_restructure") return "simulated_buyer";
  if (objectiveId === "no_fit") return "deterministic_engine";
  if (objectiveId === "negotiate_price") return "merchant";
  if (objectiveId === "month_three_review") return "merchant";
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
  const stepLabel = coreIndex >= 0 ? `Step ${coreIndex + 1} of ${core.length}` : "Optional exploration";
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
    label: "Review your prices & costs",
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
