import { z } from "zod";
import { AgreementError } from "@/domain/agreement";
import { CollectionError } from "@/domain/collections";
import { ClarificationError } from "@/domain/constraints";
import { AnswerError, ReplayIntegrityError } from "@/ai/orchestrator";
import * as svc from "@/lib/service";

/**
 * Single mutation endpoint for the five views. Every payload is validated; every action runs
 * through domain transitions. The AI layer never reaches payment actions from here.
 */
const Hash = z.string().regex(/^[0-9a-f]{64}$/);
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reset") }),
  z.object({ action: z.literal("demo_next") }),
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
  z.object({ action: z.literal("prepare_agreement"), structureId: z.string().max(200) }),
  z.object({ action: z.literal("approve_and_send"), version: z.number().int().positive(), termsHash: Hash }),
  z.object({ action: z.literal("accept_agreement"), version: z.number().int().positive(), termsHash: Hash, authorityConfirmed: z.boolean() }),
  z.object({ action: z.literal("simulate"), event: z.enum(["payment_link_paid", "mandate_confirmed", "advance_notice", "debit_failed", "debit_succeeded", "buyer_reply"]) }),
  z.object({ action: z.literal("check_payment_link") }),
  z.object({ action: z.literal("propose_amendment") }),
  z.object({ action: z.literal("approve_amendment"), termsHash: Hash }),
  z.object({ action: z.literal("accept_amendment"), termsHash: Hash, authorityConfirmed: z.boolean() }),
  z.object({ action: z.literal("run_scenario"), scenarioId: z.string().max(40).nullable() }),
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
      case "demo_next":
        result = { step: (await svc.demoNext()).step };
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
      case "prepare_agreement": {
        const v = await svc.prepareAgreement(a.structureId);
        result = { version: v.version, termsHash: v.termsHash };
        break;
      }
      case "approve_and_send":
        await svc.approveAndSend(a.version, a.termsHash);
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
    }
    return Response.json({ ok: true, result });
  } catch (e) {
    const known = e instanceof svc.ActionError || e instanceof AgreementError || e instanceof CollectionError || e instanceof ClarificationError || e instanceof AnswerError || e instanceof ReplayIntegrityError;
    const status = e instanceof svc.ActionError ? e.status : known ? 409 : 500;
    return Response.json({ ok: false, error: known ? (e as Error).message : "Unexpected error" }, { status });
  }
}
