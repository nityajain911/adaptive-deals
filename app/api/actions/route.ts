import { z } from "zod";
import { AgreementError } from "@/domain/agreement";
import { CollectionError } from "@/domain/collections";
import { ClarificationError } from "@/domain/constraints";
import { ConversationError } from "@/domain/conversation";
import { AnswerError, ReplayIntegrityError } from "@/ai/orchestrator";
import * as svc from "@/lib/service";
import { setFailNextSend } from "@/lib/presenter-store";
import { SYSTEM_STEPS, type SystemStepId } from "@/lib/demo-steps";
import { BUYER_DECLINE_REASONS, MERCHANT_CLOSE_REASONS, type BuyerDeclineReason, type MerchantCloseReason } from "@/lib/deal-records";

/**
 * Single mutation endpoint for the merchant views and the buyer proposal. Every payload is validated; every action runs
 * through domain transitions. The AI layer never reaches payment actions from here.
 */
const Hash = z.string().regex(/^[0-9a-f]{64}$/);
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reset") }),
  z.object({ action: z.literal("demo_system_step"), stepId: z.enum(SYSTEM_STEPS as unknown as [SystemStepId, ...SystemStepId[]]) }),
  z.object({ action: z.literal("run_live") }),
  z.object({ action: z.literal("replay_run"), runId: z.string().max(40) }),
  z.object({
    action: z.literal("record_answers"),
    answers: z
      .array(
        z.object({
          questionId: z.string().max(40),
          value: z.string().max(20),
          answerText: z.string().trim().min(2).max(300),
          confirmedByBuyerVia: z.enum(["whatsapp", "email", "call"]),
        }),
      )
      .min(1)
      .max(3),
  }),
  // Split approval and delivery (spec §3.3).
  z.object({ action: z.literal("select_option"), structureId: z.string().max(200) }),
  z.object({ action: z.literal("review_buyer_proposal") }),
  z.object({ action: z.literal("approve_and_send_draft"), version: z.number().int().positive(), termsHash: Hash }),
  z.object({ action: z.literal("retry_send"), version: z.number().int().positive() }),
  z.object({ action: z.literal("send_questions") }),
  z.object({ action: z.literal("accept_agreement"), version: z.number().int().positive(), termsHash: Hash, authorityConfirmed: z.boolean() }),
  z.object({ action: z.literal("simulate"), event: z.enum(["payment_link_paid", "mandate_confirmed", "advance_notice", "debit_failed", "debit_succeeded", "buyer_reply"]) }),
  z.object({ action: z.literal("check_payment_link") }),
  z.object({ action: z.literal("propose_amendment") }),
  z.object({ action: z.literal("approve_amendment"), termsHash: Hash }),
  z.object({ action: z.literal("accept_amendment"), termsHash: Hash, authorityConfirmed: z.boolean() }),
  z.object({ action: z.literal("run_scenario"), scenarioId: z.string().max(40).nullable() }),
  // Simulated conversation. Buyer replies (scripted or typed) go through code's bounded rules only.
  // Presenter-only controls (spec §8.2): never reachable from the merchant frame or audit drawer.
  z.object({ action: z.literal("presenter_pause_ai"), paused: z.boolean() }),
  z.object({ action: z.literal("presenter_fail_next_send"), on: z.boolean() }),
  // Simulated buyer reply: a pre-scripted reply or typed text, both read by the same code rules.
  z.object({ action: z.literal("buyer_reply"), inReplyTo: z.string().max(40), scriptId: z.string().max(40).optional(), text: z.string().trim().min(1).max(500).optional() }),
  z.object({ action: z.literal("adopt_replies") }),
  // Buyer proposal page (demo buyer view).
  z.object({ action: z.literal("request_change"), version: z.number().int().positive(), text: z.string().trim().min(2).max(500) }),
  z.object({ action: z.literal("decline"), version: z.number().int().positive(), reason: z.enum(Object.keys(BUYER_DECLINE_REASONS) as [BuyerDeclineReason, ...BuyerDeclineReason[]]).optional() }),
  z.object({ action: z.literal("close_by_merchant"), reason: z.enum(Object.keys(MERCHANT_CLOSE_REASONS) as [MerchantCloseReason, ...MerchantCloseReason[]]), note: z.string().max(300).optional() }),
  z.object({ action: z.literal("mark_message_handled"), messageId: z.string().max(40), note: z.string().max(300).optional() }),
  z.object({
    action: z.literal("review_work"),
    sourceKind: z.enum(["message", "change_request"]),
    sourceId: z.string().max(40),
    disposition: z.enum(["keep_current_terms", "handled_outside", "follow_up_pending"]),
    note: z.string().max(300).optional(),
  }),
  z.object({ action: z.literal("interpret_reply"), messageId: z.string().max(40), value: z.string().max(20), quote: z.string().min(1).max(300) }),
]);

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Action.safeParse(body);
  if (!parsed.success) return Response.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const a = parsed.data;
  try {
    let result: unknown = null;
    switch (a.action) {
      case "reset":
        await svc.resetToSeed();
        break;
      case "demo_system_step":
        await svc.runSystemStep(a.stepId);
        break;
      case "run_live":
        await svc.startLiveRun();
        break;
      case "replay_run":
        await svc.replayStoredRun(a.runId);
        break;
      case "record_answers":
        await svc.recordAnswers(a.answers);
        break;
      case "select_option":
        await svc.selectOption(a.structureId);
        break;
      case "review_buyer_proposal": {
        const v = await svc.reviewBuyerProposal();
        result = { version: v.version };
        break;
      }
      case "approve_and_send_draft": {
        await svc.approveDraft(a.version, a.termsHash);
        const r = await svc.sendProposal(a.version);
        result = { delivered: r.delivered, failureReason: r.failureReason };
        break;
      }
      case "retry_send": {
        const r = await svc.sendProposal(a.version);
        result = { delivered: r.delivered, failureReason: r.failureReason };
        break;
      }
      case "send_questions":
        await svc.sendQuestions();
        break;
      case "accept_agreement":
        await svc.acceptAgreement(a.version, a.termsHash, a.authorityConfirmed);
        break;
      case "simulate":
        await svc.simulate(a.event);
        break;
      case "check_payment_link":
        await svc.checkPaymentLinkStatus();
        break;
      case "propose_amendment":
        await svc.proposeAmendment();
        break;
      case "approve_amendment":
        await svc.approveAmendment(a.termsHash);
        break;
      case "accept_amendment":
        await svc.acceptAmendment(a.termsHash, a.authorityConfirmed);
        break;
      case "run_scenario":
        await svc.runScenario(a.scenarioId);
        break;
      case "presenter_pause_ai":
        await svc.setSuggestionsPaused(a.paused);
        break;
      case "presenter_fail_next_send":
        await setFailNextSend(a.on);
        break;
      case "buyer_reply":
        await svc.buyerReply({ inReplyTo: a.inReplyTo, scriptId: a.scriptId, text: a.text });
        break;
      case "adopt_replies":
        await svc.adoptRepliesAsAnswers();
        break;
      case "request_change":
        await svc.requestChange(a.version, a.text);
        break;
      case "decline":
        await svc.declineAgreement(a.version, a.reason);
        break;
      case "close_by_merchant":
        await svc.closeByMerchant(a.reason, a.note);
        break;
      case "mark_message_handled":
        await svc.markMessageHandled(a.messageId, a.note);
        break;
      case "review_work":
        await svc.reviewWork(a.sourceKind, a.sourceId, a.disposition, a.note);
        break;
      case "interpret_reply":
        await svc.interpretClarificationReply(a.messageId, a.value, a.quote);
        break;
    }
    return Response.json({ ok: true, result });
  } catch (e) {
    const known = e instanceof svc.ActionError || e instanceof AgreementError || e instanceof CollectionError || e instanceof ClarificationError || e instanceof AnswerError || e instanceof ReplayIntegrityError || e instanceof ConversationError;
    const status = e instanceof svc.ActionError ? e.status : known ? 409 : 500;
    return Response.json({ ok: false, error: known ? (e as Error).message : "Unexpected error" }, { status });
  }
}
