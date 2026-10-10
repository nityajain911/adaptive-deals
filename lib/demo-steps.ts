import { DEMO_ANCHOR, SimulatedClock } from "@/domain/clock";
import { compareDates, formatDate, localDateOf } from "@/domain/dates";
import { heroScriptedReplies } from "@/data/synthetic/hero";
import { demoCase } from "@/data/synthetic/cases";
import { isDelivered } from "./deal-records";
import type { DealProgress } from "./progress";
import type { DemoState } from "./service";
import type { DemoStepShape, SystemStepId } from "./demo-step-types";
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
      return nav("buyer_accept", "buyer", "Next: the buyer accepts on the proposal page", proposalHref(s.agreements[0]?.agreementId ?? "agr-hero", v));
    }
    case "track.buyer_setup": {
      const linkUnpaid = s.attempts.some((a) => a.method === "payment_link" && a.status === "scheduled");
      if (linkUnpaid) {
        const link = s.attempts.find((a) => a.method === "payment_link" && a.status === "scheduled")!;
        return sys("pay_upfront_link", `Simulate: buyer pays the upfront link on ${formatDate(link.dueDate)}`, at("track"));
      }
      return sys("confirm_mandate", "Simulate: buyer authorises the mandate", at("track"));
    }
    case "track.next_payment": {
      if (s.amendments.at(-1)?.state === "active") return null; // storyboard complete
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
    default:
      // Terminal states, debit outcomes (secondary presenter scenario) and fully paid: nothing to guide.
      return null;
  }
}

/** The message a simulated buyer reply is expected for, with its pre-scripted replies; null if none. */
export function replyContext(s: DemoState): { inReplyTo: string; label: string; scripts: { id: string; text: string }[] } | null {
  const replied = (id: string) => s.conversation.some((r) => r.inReplyTo === id);
  if (s.status === "clarifying") {
    const q = s.conversation.find((i) => i.kind === "clarification" && i.sentAt && !replied(i.id));
    if (!q) return null;
    return { inReplyTo: q.id, label: q.text, scripts: heroScriptedReplies.filter((r) => r.context === "clarification" && "questionId" in r && r.questionId === q.refs.questionId).map((r) => ({ id: r.id, text: r.text })) };
  }
  const notice = [...s.conversation].reverse().find((i) => i.kind === "notice" && i.sentAt);
  if (!notice || replied(notice.id)) return null;
  const attempt = s.attempts.find((a) => a.id === notice.refs.attemptId);
  if (attempt?.status !== "scheduled" || !s.deliveries.some((d) => isDelivered(s.deliveries, d.version))) return null;
  return { inReplyTo: notice.id, label: notice.text, scripts: heroScriptedReplies.filter((r) => r.context === "notice").map((r) => ({ id: r.id, text: r.text })) };
}
