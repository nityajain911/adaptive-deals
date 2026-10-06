import { formatDate } from "@/domain/dates";
import { formatINR } from "@/domain/money";
import type { DemoState } from "./service";
import type { UnresolvedWorkItem } from "./views";

/**
 * One pure derivation of the deal's current stage, status and next action (spec §3.4).
 * Derived only from domain facts, never from routes or visited pages. The banner, stage tracker,
 * deal-home redirect and every Now card read from it.
 */
export type StageId = "understand" | "offer" | "track";
export type ProgressKind = "action_required" | "waiting_on_buyer" | "waiting_on_system" | "informational" | "terminal";
export type StageStatus = "done" | "current" | "upcoming" | "closed" | "completed";
export type PrimaryActionId =
  | "send_questions"
  | "use_answers"
  | "interpret_reply"
  | "send_missing_question"
  | "confirm_required_services"
  | "review_buyer_proposal"
  | "review_updated_proposal"
  | "review_new_evidence"
  | "retry_sending"
  | "close_in_adaptive_deals"
  | "mark_handled_outside"
  | "review_revised_terms"
  | "draft_revised_terms"
  | "review_buyer_request"
  | "review_conflicting_evidence"
  | "review_follow_up"
  | "review_buyer_message"
  | "inspect_records";

export interface DealProgress {
  stage: StageId;
  stages: Record<StageId, StageStatus>;
  kind: ProgressKind;
  actor: "merchant" | "buyer" | "system" | null;
  headline: string;
  primaryAction: { id: PrimaryActionId; label: string } | null;
  blockingReason: string | null;
  version: number | null;
  /** The matched table row, for tests and the audit. */
  rule: string;
}

export interface ProgressFacts {
  engineState: "ambiguous" | "insufficient_information" | "outside_templates" | "no_feasible_deal" | "options_ready";
  draftStale: boolean;
  fullyPaid: boolean;
  questionCountUnsent: number;
  unansweredQuestions: number;
  repliesNeedInterpretation: number;
  attentionMessages: number;
  workItems: UnresolvedWorkItem[];
  unreviewedDecisionEvidence: number;
  /** Required-service phrases the extraction returned that code could not map and the merchant has not confirmed. */
  unmappedRequiredServices: number;
  nextPayment: { amountPaise: number; dueDate: string } | null;
  pendingDebit: "submitted" | { retryOn: string } | null;
  buyerSetup: { linkUnpaid: boolean; mandatePending: boolean };
  changeRequestDetail: { unavailableUntil: string; lineDueDate: string } | null;
  lastFailure: string | null;
}

export type ProgressState = Pick<DemoState, "status" | "deliveries" | "agreements" | "amendments" | "changeRequests" | "reviewRequired" | "selectedOption"> & { counterOffers?: DemoState["counterOffers"] };

const ORDER: StageId[] = ["understand", "offer", "track"];
const COUNT_WORD = ["no", "one", "two", "three", "four", "five", "six"];
const countWord = (n: number) => COUNT_WORD[n] ?? String(n);

function stagesFor(stage: StageId, end: "closed" | "completed" | null): Record<StageId, StageStatus> {
  const i = ORDER.indexOf(stage);
  return Object.fromEntries(ORDER.map((id, j) => [id, j < i ? "done" : j > i ? "upcoming" : (end ?? "current")])) as Record<StageId, StageStatus>;
}

type R = Omit<DealProgress, "stages">;
const act = (stage: StageId, rule: string, headline: string, id: PrimaryActionId, label: string, version: number | null = null, blockingReason: string | null = null): R => ({
  stage,
  rule,
  headline,
  kind: "action_required",
  actor: "merchant",
  primaryAction: { id, label },
  blockingReason,
  version,
});
const info = (stage: StageId, rule: string, kind: Exclude<ProgressKind, "action_required">, actor: DealProgress["actor"], headline: string, version: number | null = null): R => ({
  stage,
  rule,
  headline,
  kind,
  actor,
  primaryAction: null,
  blockingReason: null,
  version,
});

export function dealProgress(s: ProgressState, f: ProgressFacts): DealProgress {
  const r = resolve(s, f);
  const end = r.kind !== "terminal" ? null : s.status === "completed" ? "completed" : "closed";
  return { ...r, stages: stagesFor(r.stage, end) };
}

function resolve(s: ProgressState, f: ProgressFacts): R {
  const activeV = [...s.agreements].reverse().find((v) => v.status === "active")?.version ?? null;
  const latest = s.agreements.at(-1)?.version ?? null;

  // Migration safeguard: never guess around inconsistent saved history.
  if (s.reviewRequired) {
    return act(s.agreements.length ? "offer" : "understand", "review.required", `Saved deal records need review before this deal can continue. ${s.reviewRequired}`, "inspect_records", "Inspect records");
  }

  // A counter-offer in preparation: the earlier proposal was withdrawn and nothing newer has been delivered, so the merchant is back at Offer.
  const counter = s.counterOffers?.at(-1);
  const countering = !!counter && !s.deliveries.some((d) => d.deliveredAt !== null && d.version > counter.fromVersion);

  // 1. A proposal was ever delivered → Track, whatever historical fields say.
  if (!countering && s.deliveries.some((d) => d.deliveredAt !== null)) {
    const a = s.amendments.at(-1);
    if (s.status === "buyer_rejected") return info("track", "track.terminal", "terminal", null, `Buyer declined offer version ${latest}.`, latest);
    if (s.status === "completed") return info("track", "track.terminal", "terminal", null, "Deal completed.", latest);
    const buyerRequest = f.workItems.find((w) => w.kind === "buyer_request");
    if (buyerRequest) return act("track", "track.buyer_request", "The buyer requested a change. Review it before the deal continues.", "review_buyer_request", "Review buyer request", buyerRequest.version);
    if (a?.state === "proposed") return act("track", "track.amendment_merchant", "The buyer asked to move a payment. Review the revised terms.", "review_revised_terms", "Review revised terms", a.toVersion);
    if (a?.state === "merchant_approved") return info("track", "track.amendment_buyer", "waiting_on_buyer", "buyer", "Waiting for the buyer to accept the revised terms.", a.toVersion);
    const conflict = f.workItems.find((w) => w.kind === "conflicting_evidence");
    if (conflict) return act("track", "track.conflicting_evidence", "The buyer sent new information that conflicts with an open request. Review it before changing the payment.", "review_conflicting_evidence", "Review buyer message", conflict.version);
    const cr = s.changeRequests.find((c) => c.state === "change_requested" && c.agreementVersion === activeV);
    if (cr && f.changeRequestDetail) {
      return act("track", "track.change_request", `The buyer can't pay until after ${formatDate(f.changeRequestDetail.unavailableUntil)}. Draft revised terms.`, "draft_revised_terms", "Draft revised terms", activeV);
    }
    const failed = f.workItems.find((w) => w.kind === "not_restructured");
    if (failed) return act("track", "track.not_restructured", "The requested date does not fit the confirmed limits. The original payment remains scheduled. Review with the buyer.", "review_follow_up", "Review with buyer", failed.version);
    const followUp = f.workItems.find((w) => w.kind === "follow_up_pending");
    if (followUp) return act("track", "track.follow_up_pending", followUp.note ? `Follow-up still pending · ${followUp.note}` : "Follow-up with the buyer is still pending.", "review_follow_up", "Review follow-up", followUp.version);
    if (f.attentionMessages > 0) {
      const one = f.attentionMessages === 1;
      return act("track", "track.attention", one ? "A buyer message needs your reply." : `${f.attentionMessages} buyer messages need your reply.`, "review_buyer_message", one ? "Review buyer message" : `Review ${f.attentionMessages} buyer messages`, activeV);
    }
    if (s.status === "sent") return info("track", "track.sent_awaiting_buyer", "waiting_on_buyer", "buyer", `Waiting for the buyer to review offer version ${latest}.`, latest);
    const { linkUnpaid, mandatePending } = f.buyerSetup;
    if (linkUnpaid || mandatePending) {
      const what = linkUnpaid && mandatePending ? "pay the upfront link and authorise recurring payments" : linkUnpaid ? "pay the upfront link" : "authorise recurring payments";
      return info("track", "track.buyer_setup", "waiting_on_buyer", "buyer", `Buyer accepted. Waiting for the buyer to ${what}.`, activeV);
    }
    if (f.pendingDebit === "submitted") return info("track", "track.debit_pending", "waiting_on_system", "system", "Awaiting payment outcome.", activeV);
    if (f.pendingDebit) return info("track", "track.debit_pending", "waiting_on_system", "system", `Debit failed · retry scheduled for ${formatDate(f.pendingDebit.retryOn)}.`, activeV);
    if (f.nextPayment) return info("track", "track.next_payment", "informational", null, `Up to date · next payment ${formatINR(f.nextPayment.amountPaise)} on ${formatDate(f.nextPayment.dueDate)}.`, activeV);
    if (f.fullyPaid) return info("track", "track.fully_paid", "informational", null, "All scheduled payments collected.", activeV);
    throw new Error("dealProgress: unmapped Track state");
  }

  // 2–3. Offer, including closure before any successful send.
  if (s.status === "merchant_rejected") return info("offer", "offer.closed", "terminal", null, "Closed in Adaptive Deals.", latest);
  // A buyer's required services that no package matched must be confirmed by the merchant before any offer.
  if (f.engineState === "options_ready" && f.unmappedRequiredServices > 0) {
    return act("understand", "understand.scope", "Confirm which services the buyer requires before we recommend an offer.", "confirm_required_services", "Confirm required services");
  }
  if (f.unreviewedDecisionEvidence > 0) return act("offer", "offer.new_evidence", "Review newer buyer evidence before sending this offer.", "review_new_evidence", "Review buyer evidence", latest);
  if (s.status === "approved") return act("offer", "offer.approved_unsent", "Approved · not yet sent to the buyer.", "retry_sending", "Retry sending", latest, f.lastFailure);
  if (f.engineState === "options_ready") {
    return f.draftStale
      ? act("offer", "offer.stale", "The offer changed since you reviewed it.", "review_updated_proposal", "Review updated proposal")
      : act("offer", "offer.review", "Review this offer before sending it.", "review_buyer_proposal", "Review buyer proposal");
  }
  if (f.engineState === "no_feasible_deal") return act("offer", "offer.no_feasible", "No offer fits both the buyer's confirmed limits and your current rules.", "close_in_adaptive_deals", "Close in Adaptive Deals");
  if (f.engineState === "outside_templates") return act("offer", "offer.outside_templates", "This request needs a custom arrangement.", "mark_handled_outside", "Mark as handled outside Adaptive Deals");

  // 4. Understand.
  if (f.questionCountUnsent > 0) {
    const n = f.questionCountUnsent;
    return act("understand", "understand.send", `Confirm ${countWord(n)} ${n === 1 ? "detail" : "details"} before we can recommend an offer.`, "send_questions", n === 1 ? "Send question to buyer" : `Send ${n} questions to buyer`);
  }
  if (f.unansweredQuestions > 0) return info("understand", "understand.waiting", "waiting_on_buyer", "buyer", "Waiting for the buyer to answer.");
  if (f.repliesNeedInterpretation > 0) return act("understand", "understand.interpret", "One answer needs your interpretation.", "interpret_reply", "Interpret buyer's reply");
  if (f.engineState === "ambiguous") return act("understand", "understand.use_answers", "The buyer answered. Use these answers to build an offer.", "use_answers", "Use these answers");
  return act("understand", "understand.missing", "We need the buyer's budget before we can recommend an offer.", "send_missing_question", "Send question to buyer");
}
