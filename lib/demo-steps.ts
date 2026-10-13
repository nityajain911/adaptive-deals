import { DEMO_ANCHOR, SimulatedClock } from "@/domain/clock";
import { compareDates, formatDate, localDateOf } from "@/domain/dates";
import { heroScriptedReplies } from "@/data/synthetic/hero";
import { demoCase, scriptedReplyText } from "@/data/synthetic/cases";
import { isDelivered } from "./deal-records";
import type { DealProgress } from "./progress";
import type { DemoState } from "./service";
import type { DemoStepShape, ReplyContext, SystemStepId } from "./demo-step-types";
export { demoStepConsequence, SYSTEM_STEPS, type DemoStepType, type SystemStepId } from "./demo-step-types";

/**
 * The guided demo storyboard (spec §8.1, plan Task 13), canonical preventive path.
 * Merchant and buyer decisions are never executed here: their steps only navigate and instruct.
 * Only labelled system events are executable (see `runSystemStep` in the service).
 */
export type DemoStep = DemoStepShape;

const nav = (id: string, type: "merchant" | "buyer", label: string, href: string, usesReplyControl = false): DemoStep => ({ id, type, label, href, systemAction: null, usesReplyControl });
const sys = (id: SystemStepId, label: string, href: string): DemoStep => ({ id, type: "system", label, href, systemAction: id, usesReplyControl: false });

const proposalHref = (agreementId: string, version: number) => `/proposal/${agreementId}/v${version}`;

/** The notice the next scheduled recurring debit needs, if any. */
function pendingNotice(s: DemoState) {
  return s.notices.find((n) => !n.sentAt && s.attempts.find((a) => a.id === n.attemptId)?.status === "scheduled") ?? null;
}

export function nextDemoStep(s: DemoState, progress: DealProgress, dealId: string): DemoStep | null {
  const at = (stage: string) => `/deals/${dealId}/${stage}`;
  switch (progress.rule) {
    case "review.required":
      return nav("inspect_records", "merchant", "Next: inspect the saved records", at(progress.stage));
    case "understand.send":
      return nav("send_questions", "merchant", "Next: send the questions to the buyer", at("understand"));
    case "understand.waiting":
      return nav("buyer_reply", "buyer", "Next: simulated buyer reply to the question", at("understand"), true);
    case "understand.interpret":
      return nav("interpret_reply", "merchant", "Next: interpret the buyer's reply", at("understand"));
    case "understand.scope":
      return nav("confirm_required_services", "merchant", "Next: confirm the services the buyer requires", at("understand"));
    case "understand.use_answers":
      return nav("use_answers", "merchant", "Next: use the buyer's answers", at("understand"));
    case "understand.missing":
      return nav("send_missing_question", "merchant", "Next: ask the buyer for the missing detail", at("understand"));
    case "offer.review":
      if (s.selectedOption?.draftVersion && s.agreements.some((agreement) => agreement.version === s.selectedOption?.draftVersion && agreement.status === "draft")) {
        return nav("approve_and_send_draft", "merchant", "Next: approve and send the exact buyer proposal", `${at("offer")}/preview`);
      }
      return nav("review_buyer_proposal", "merchant", "Next: review the buyer proposal", at("offer"));
    case "offer.stale":
      return nav("review_buyer_proposal", "merchant", "Next: review the buyer proposal", at("offer"));
    case "offer.approved_unsent":
      return nav("retry_sending", "merchant", "Next: retry sending the proposal", at("offer"));
    case "offer.no_feasible":
    case "offer.outside_templates":
      return nav("close_offer", "merchant", "Next: decide how to close this deal", at("offer"));
    case "track.sent_awaiting_buyer": {
      const v = progress.version ?? 1;
      // At the review the buyer has two ways to go; the guide sends the presenter to the page where both are.
      if (s.agreements.find((a) => a.version === v)?.continuesFrom) return nav("buyer_decide", "buyer", "Next: the buyer chooses on the proposal page: accept and pay, or stop here", proposalHref(s.agreements[0]?.agreementId ?? "agr-hero", v));
      return nav("buyer_accept", "buyer", "Next: the buyer accepts on the proposal page", proposalHref(s.agreements[0]?.agreementId ?? "agr-hero", v));
    }
    case "track.buyer_setup":
      // The buyer pays and sets up automatic payment in one step on their proposal page.
      return nav("buyer_setup", "buyer", "Next: the buyer pays on the proposal page", proposalHref(s.agreements[0]?.agreementId ?? "agr-hero", progress.version ?? 1));
    case "track.next_payment": {
      // The story ends when the buyer has taken the rest of the year: two phases, and the deal closes in the second.
      if (s.agreements.some((v) => v.continuesFrom && v.status === "active")) return null;
      if (s.amendments.at(-1)?.state === "active") return afterStoryboard(s, at("track"));
      // Complete the current notice exchange before jumping to a later instalment.
      if (replyContext(s)) return nav("buyer_reply", "buyer", "Next: simulated buyer reply to the notice", at("track"), true);
      const n = pendingNotice(s);
      if (n) {
        const timeZone = demoCase(s.caseId)?.deal.merchant.timeZone ?? "Asia/Kolkata";
        const today = localDateOf(new SimulatedClock(DEMO_ANCHOR, s.clockAdvances).now(), timeZone);
        return compareDates(today, n.sendOn) < 0 ? sys("advance_to_notice", `Advance simulated date to ${formatDate(n.sendOn)}`, at("track")) : sys("send_notice", "Send scheduled advance notice", at("track"));
      }
      return null;
    }
    case "track.change_request":
      return nav("draft_revised_terms", "merchant", "Next: draft the revised terms", at("track"));
    case "track.amendment_merchant":
      return nav("review_revised_terms", "merchant", "Next: review and approve the revised terms", at("track"));
    case "track.amendment_buyer": {
      const v = progress.version ?? 2;
      return nav("buyer_accept_revision", "buyer", "Next: the buyer accepts the revised terms", proposalHref(s.agreements[0]?.agreementId ?? "agr-hero", v));
    }
    case "track.attention":
      return nav("review_buyer_message", "merchant", "Next: review the buyer's message", at("track"));
    case "track.follow_on_waiting": {
      const held = heldOf(s);
      return held ? sys("advance_to_review", `Advance simulated date to ${formatDate(held.reviewDate)}`, at("track")) : null;
    }
    case "track.follow_on_awaiting_buyer":
      return nav("buyer_reply", "buyer", "Next: simulated buyer decision after the pilot", at("track"), true);
    case "track.follow_on_buyer_stop":
      return nav("close_follow_on", "merchant", "Next: close the deal after the first phase", at("track"));
    case "track.follow_on_changes":
    case "track.follow_on_due":
      return nav("send_follow_on", "merchant", "Next: send the rest of the year", at("track"));
    default:
      // Terminal states, debit outcomes (secondary presenter scenario) and fully paid: nothing to guide.
      return null;
  }
}

const heldOf = (s: DemoState) => [...s.agreements].reverse().find((v) => v.status === "active")?.terms.followOn ?? null;

/**
 * Where the hero storyboard used to end: a payment moved and agreed. When the first phase holds the rest of the year, the
 * guide goes on, one labelled step at a time, to the last payment of the first phase and the month-three review.
 */
function afterStoryboard(s: DemoState, href: string): DemoStep | null {
  if (s.followOnSale || !heldOf(s)) return null;
  const due = s.attempts.filter((a) => a.status === "scheduled" && a.method === "recurring_debit" && a.origin !== "internal_retry").sort((p, q) => compareDates(p.dueDate, q.dueDate))[0];
  return due ? sys("collect_payment", `Collect the payment due ${formatDate(due.dueDate)}`, href) : null;
}

/** The message a simulated buyer reply is expected for, with its pre-scripted replies; null if none. */
export function replyContext(s: DemoState): ReplyContext | null {
  const replied = (id: string) => s.conversation.some((r) => r.inReplyTo === id);
  if (s.status === "clarifying") {
    const q = s.conversation.find((i) => i.kind === "clarification" && i.sentAt && !replied(i.id));
    if (!q) return null;
    return { inReplyTo: q.id, label: q.text, scripts: heroScriptedReplies.filter((r) => r.context === "clarification" && "questionId" in r && r.questionId === q.refs.questionId).map((r) => ({ id: r.id, text: scriptedReplyText(s.caseId, r) })) };
  }
  // After the pilot, the buyer's decision: carry on, ask for a change, or stop.
  const review = [...s.conversation].reverse().find((i) => i.kind === "review" && i.sentAt);
  if (review && !replied(review.id)) {
    const say = (id: string) => heroScriptedReplies.find((r) => r.id === id)!;
    const change = ["review-change-price", "review-change-date", "review-change-scope"].map((id) => ({ id, text: say(id).text }));
    return {
      inReplyTo: review.id,
      label: review.text,
      scripts: [
        { id: "review-proceed", text: say("review-proceed").text },
        { id: "review-stop", text: say("review-stop").text },
        { id: "review-changes", text: "Proceed with some changes", followUp: { legend: "Which change does the buyer want?", scripts: change } },
      ],
    };
  }
  const notice = [...s.conversation].reverse().find((i) => i.kind === "notice" && i.sentAt);
  if (!notice || replied(notice.id)) return null;
  const attempt = s.attempts.find((a) => a.id === notice.refs.attemptId);
  if (attempt?.status !== "scheduled" || !s.deliveries.some((d) => isDelivered(s.deliveries, d.version))) return null;
  return { inReplyTo: notice.id, label: notice.text, scripts: heroScriptedReplies.filter((r) => r.context === "notice").map((r) => ({ id: r.id, text: r.text })) };
}
