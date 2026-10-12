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
import { CASE_IDS, type CaseId } from "@/data/synthetic/cases";
import { EconomicsError, type EconomicsContent } from "@/domain/business-economics";
import { STRATEGY_IDS } from "@/domain/strategy-id";
import { activateEconomicsDraft, discardEconomicsDraft, resetEconomicsStore, restoreDefaultEconomics, saveEconomicsDraft } from "@/lib/economics-store";
import { previewEconomicsActivation } from "@/lib/economics-activation";
import { approveMcpCollectionIntent, executeMcpCollectionIntent, McpActionError, prepareMcpCollectionIntent, refreshMcpCollectionStatus } from "@/lib/mcp-service";
import { economicsLabel } from "@/lib/economics-illustrative";

/**
 * Single mutation endpoint for the merchant views and the buyer proposal. Every payload is validated; every action runs
 * through domain transitions. The AI layer never reaches payment actions from here.
 */
const Hash = z.string().regex(/^[0-9a-f]{64}$/);
const Paise = z.number().int();
const ServicePackage = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  kind: z.enum(["one_time", "monthly"]),
  listPricePaise: Paise,
  directCostPaise: Paise,
  costTiming: z.literal("start_of_delivery_month"),
  deferrable: z.boolean(),
  removable: z.boolean(),
  hasIndependentValue: z.boolean(),
  dependsOnAny: z.array(z.string().min(1).max(80)).max(20).optional(),
}).strict();
const PaymentPlan = z.object({ id: z.string(), label: z.string(), offsetsMonths: z.array(z.number().int()), weightsBps: z.array(z.number().int()).optional() }).strict();
const ScopeItem = z.object({ packageId: z.string(), months: z.number().int() }).strict();
const EconomicsContentSchema: z.ZodType<EconomicsContent> = z.object({
  services: z.array(ServicePackage).min(1).max(50),
  guardrails: z.object({
    contributionFloor: z.object({ minPercentBps: Paise.nullable(), minPaise: Paise.nullable(), combine: z.enum(["both", "either"]) }).strict(),
    discountLimitBps: Paise,
    cashAtRiskLimitPaise: Paise,
    smallestInstalmentPaise: Paise,
    maxTenureMonths: Paise,
    paymentFeeBps: Paise,
  }).strict(),
  discountLadderBps: z.array(Paise).max(30),
  fixed: z.object({
    gstRateBps: Paise,
    advanceNoticeDays: Paise,
    internalRetryAfterDays: Paise,
    mandateEndBufferMonths: Paise,
    offerTypes: z.object({
      fullScope: z.array(ScopeItem),
      defaultStartDate: z.string(),
      split_payment: z.object({ enabled: z.boolean(), plans: z.array(PaymentPlan) }).strict(),
      phased_scope: z.object({ enabled: z.boolean(), phase1Scopes: z.array(z.object({ id: z.string(), label: z.string(), items: z.array(ScopeItem) }).strict()), plans: z.array(PaymentPlan) }).strict(),
      deferred_start: z.object({ enabled: z.boolean(), startDates: z.array(z.string()), plans: z.array(PaymentPlan) }).strict(),
      shorter_commitment: z.object({ enabled: z.boolean(), terms: z.array(z.object({ termMonths: Paise, plans: z.array(PaymentPlan) }).strict()) }).strict(),
    }).strict(),
  }).strict(),
}).strict();
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reset") }),
  z.object({ action: z.literal("start_case"), caseId: z.enum(CASE_IDS as unknown as [CaseId, ...CaseId[]]) }),
  z.object({ action: z.literal("open_deal"), caseId: z.enum(CASE_IDS as unknown as [CaseId, ...CaseId[]]) }),
  z.object({ action: z.literal("demo_system_step"), stepId: z.enum(SYSTEM_STEPS as unknown as [SystemStepId, ...SystemStepId[]]) }),
  z.object({ action: z.literal("run_live") }),
  z.object({ action: z.literal("replay_run"), runId: z.string().max(40) }),
  z.object({ action: z.literal("preview_reevaluation"), toVersion: z.number().int().positive().optional() }),
  z.object({ action: z.literal("reevaluate_deal"), toVersion: z.number().int().positive() }),
  z.object({ action: z.literal("save_economics_draft"), content: EconomicsContentSchema }).strict(),
  z.object({ action: z.literal("discard_economics_draft") }).strict(),
  z.object({ action: z.literal("preview_economics_activation") }).strict(),
  z.object({ action: z.literal("activate_economics") }).strict(),
  z.object({ action: z.literal("restore_default_economics") }).strict(),
  z.object({ action: z.literal("reset_economics_for_tests") }).strict(),
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
  z.object({ action: z.literal("set_strategy"), strategy: z.enum(STRATEGY_IDS) }).strict(),
  z
    .object({
      action: z.literal("add_input_override"),
      field: z.enum(["direct_cost", "contribution_floor", "cash_exposure", "discount_limit"]),
      packageId: z.string().max(60).optional(),
      value: z.union([z.number().int(), z.object({ minPercentBps: z.number().int().nullable(), minPaise: z.number().int().nullable(), combine: z.enum(["both", "either"]) }).strict()]),
      reason: z.string().max(300),
    })
    .strict(),
  z.object({ action: z.literal("remove_input_override"), id: z.string().max(60) }).strict(),
  z.object({ action: z.literal("corridor_view"), requestedPaise: z.number().int().positive().max(100_000_000_00).optional(), gstBasis: z.enum(["including", "excluding"]).optional() }).strict(),
  z.object({ action: z.literal("answer_with_offer"), structureId: z.string().max(200) }).strict(),
  z.object({ action: z.literal("check_counter_offer"), totalPaise: z.number().int().positive().max(100_000_000_00) }),
  z.object({ action: z.literal("counter_offer"), totalPaise: z.number().int().positive().max(100_000_000_00), overrideConfirmed: z.boolean(), acknowledgedChecks: z.array(z.string().max(80)).max(20), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal("approve_and_send_draft"), version: z.number().int().positive(), termsHash: Hash }),
  z.object({ action: z.literal("retry_send"), version: z.number().int().positive() }),
  z.object({ action: z.literal("send_questions"), edits: z.record(z.string().max(80), z.string().max(400)).optional() }),
  z.object({ action: z.literal("accept_agreement"), version: z.number().int().positive(), termsHash: Hash, authorityConfirmed: z.boolean() }),
  z.object({ action: z.literal("simulate"), event: z.enum(["payment_link_paid", "mandate_confirmed", "advance_notice", "debit_failed", "debit_succeeded", "buyer_reply"]) }),
  z.object({ action: z.literal("check_payment_link") }),
  z.object({ action: z.literal("prepare_mcp_collection") }).strict(),
  z.object({ action: z.literal("approve_mcp_collection"), intentId: z.string().max(80) }).strict(),
  z.object({ action: z.literal("execute_mcp_collection"), intentId: z.string().max(80) }).strict(),
  z.object({ action: z.literal("refresh_mcp_collection"), intentId: z.string().max(80) }).strict(),
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
  z.object({ action: z.literal("understand_reviewed") }),
  z.object({ action: z.literal("buyer_complete_setup") }),
  // Buyer proposal page (demo buyer view).
  z.object({
    action: z.literal("request_change"),
    version: z.number().int().positive(),
    // Free text, or the optional note that goes with a structured request (the server builds the message from the request).
    text: z.string().trim().max(500).default(""),
    topic: z.enum(["date", "scope", "price", "other"]).optional(),
    detail: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("price"), targetPaise: z.number().int().positive().max(100_000_000_00), gstBasis: z.enum(["including", "excluding"]) }).strict(),
        z.object({ kind: z.literal("scope"), packageIds: z.array(z.string().max(60)).max(12) }).strict(),
        z.object({ kind: z.literal("date"), lineId: z.string().max(60), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict(),
        z.object({ kind: z.literal("other") }).strict(),
      ])
      .optional(),
  }),
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
  z.object({ action: z.literal("ask_clarification_again"), messageId: z.string().max(40) }),
  z.object({ action: z.literal("confirm_required_services"), packageIds: z.array(z.string().max(60)).min(1).max(12) }),
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
      case "start_case":
        await svc.startCase(a.caseId);
        break;
      case "open_deal":
        await svc.openDeal(a.caseId);
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
      case "preview_reevaluation":
        result = await svc.previewReevaluation(a.toVersion);
        break;
      case "reevaluate_deal":
        await svc.reevaluateDeal(a.toVersion);
        break;
      case "save_economics_draft":
        result = { issues: await saveEconomicsDraft(a.content) };
        break;
      case "discard_economics_draft":
        await discardEconomicsDraft();
        break;
      case "preview_economics_activation":
        result = await previewEconomicsActivation();
        break;
      case "activate_economics": {
        const version = await activateEconomicsDraft("Merchant (Pinecone Media Works)", new Date().toISOString());
        result = {
          version: version.version,
          hash: version.hash,
          activatedAt: version.activatedAt,
          label: economicsLabel(version.hash, version.version),
        };
        break;
      }
      case "restore_default_economics": {
        const version = await restoreDefaultEconomics("Merchant (Pinecone Media Works)", new Date().toISOString());
        result = { version: version.version };
        break;
      }
      case "reset_economics_for_tests":
        if (!process.env.ADAPTIVE_DEALS_DATA_DIR?.startsWith(".data-e2e")) throw new svc.ActionError("Economics reset requires a test data directory");
        await resetEconomicsStore();
        break;
      case "record_answers":
        await svc.recordAnswers(a.answers);
        break;
      case "select_option":
        await svc.selectOption(a.structureId);
        break;
      case "corridor_view":
        result = await svc.corridorFor({ requestedPaise: a.requestedPaise, gstBasis: a.gstBasis });
        break;
      case "answer_with_offer":
        await svc.answerWithOffer(a.structureId);
        break;
      case "check_counter_offer":
        result = await svc.checkCounterOffer(a.totalPaise);
        break;
      case "counter_offer":
        await svc.makeCounterOffer(a.totalPaise, a.overrideConfirmed, a.acknowledgedChecks, { reason: a.reason ?? "" });
        break;
      case "set_strategy":
        await svc.setStrategy(a.strategy);
        break;
      case "add_input_override":
        await svc.addInputOverride({ field: a.field, packageId: a.packageId, value: a.value, reason: a.reason });
        break;
      case "remove_input_override":
        await svc.removeInputOverride(a.id);
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
        await svc.sendQuestions(a.edits);
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
      case "prepare_mcp_collection":
        result = await prepareMcpCollectionIntent();
        break;
      case "approve_mcp_collection":
        result = await approveMcpCollectionIntent(a.intentId);
        break;
      case "execute_mcp_collection":
        result = await executeMcpCollectionIntent(a.intentId);
        break;
      case "refresh_mcp_collection":
        result = await refreshMcpCollectionStatus(a.intentId);
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
      case "buyer_complete_setup":
        await svc.buyerCompleteSetup();
        break;
      case "understand_reviewed":
        await svc.markUnderstandReviewed();
        break;
      case "request_change":
        await svc.requestChange(a.version, a.text, a.topic, a.detail);
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
      case "confirm_required_services":
        await svc.confirmRequiredServices(a.packageIds);
        break;
      case "interpret_reply":
        await svc.interpretClarificationReply(a.messageId, a.value, a.quote);
        break;
      case "ask_clarification_again":
        await svc.askClarificationAgain(a.messageId);
        break;
    }
    return Response.json({ ok: true, result });
  } catch (e) {
    const known = e instanceof svc.ActionError || e instanceof McpActionError || e instanceof EconomicsError || e instanceof AgreementError || e instanceof CollectionError || e instanceof ClarificationError || e instanceof AnswerError || e instanceof ReplayIntegrityError || e instanceof ConversationError;
    const status = e instanceof svc.ActionError ? e.status : known ? 409 : 500;
    return Response.json({ ok: false, error: known ? (e as Error).message : "Unexpected error" }, { status });
  }
}
