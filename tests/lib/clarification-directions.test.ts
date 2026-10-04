import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-directions-"));
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic";

type Svc = typeof import("@/lib/service");
let svc: Svc;
beforeAll(async () => {
  svc = await import("@/lib/service");
});

const commercialSnapshot = (s: Awaited<ReturnType<Svc["getState"]>>) => ({
  agreements: s.agreements,
  attempts: s.attempts,
  paymentLinks: s.paymentLinks,
  mandate: s.mandate,
  amendments: s.amendments,
});

describe("all clarification directions", () => {
  it.each([
    ["clar-gst-yes", "clar-approval-contract", "yes", "per_contract"],
    ["clar-gst-no", "clar-approval-contract", "no", "per_contract"],
    ["clar-gst-yes", "clar-approval-payment", "yes", "per_payment"],
    ["clar-gst-no", "clar-approval-payment", "no", "per_payment"],
  ] as const)("adopts %s and %s as explicit supported values", async (gstScript, approvalScript, gst, approval) => {
    let s = await svc.resetToSeed();
    s = await svc.sendQuestions();
    const gstQuestion = s.conversation.find((item) => item.kind === "clarification" && item.refs.questionId === "clar-gst")!;
    const approvalQuestion = s.conversation.find((item) => item.kind === "clarification" && item.refs.questionId === "clar-approval")!;
    s = await svc.buyerReply({ inReplyTo: gstQuestion.id, scriptId: gstScript });
    expect(s.conversation.at(-1)?.refs.answerValue).toBe(gst);
    s = await svc.buyerReply({ inReplyTo: approvalQuestion.id, scriptId: approvalScript });
    expect(s.conversation.at(-1)?.refs.answerValue).toBe(approval);
    s = await svc.adoptRepliesAsAnswers();
    expect(svc.decisionAnswers(s).map((answer) => answer.value)).toEqual([gst, approval]);
    expect((await svc.currentOutcome(s)).evaluation.state).toBe("options_ready");
  });

  it.each([
    ["clar-gst", "clar-gst-unclear"],
    ["clar-approval", "clar-approval-unclear"],
  ] as const)("keeps the uncertain %s reply unresolved and financially inert", async (questionId, scriptId) => {
    let s = await svc.resetToSeed();
    s = await svc.sendQuestions();
    const before = commercialSnapshot(s);
    const question = s.conversation.find((item) => item.kind === "clarification" && item.refs.questionId === questionId)!;
    s = await svc.buyerReply({ inReplyTo: question.id, scriptId });
    const reply = s.conversation.at(-1)!;
    expect(reply.refs.answerValue).toBeUndefined();
    const otherId = questionId === "clar-gst" ? "clar-approval" : "clar-gst";
    const otherScript = questionId === "clar-gst" ? "clar-approval-contract" : "clar-gst-yes";
    const other = s.conversation.find((item) => item.kind === "clarification" && item.refs.questionId === otherId)!;
    s = await svc.buyerReply({ inReplyTo: other.id, scriptId: otherScript });
    await expect(svc.adoptRepliesAsAnswers()).rejects.toThrow(/manually/);
    expect(commercialSnapshot(await svc.getState())).toEqual(before);
  });

  it("asks again through an explicit merchant action and adopts a later clear answer to the latest question", async () => {
    let s = await svc.resetToSeed();
    s = await svc.sendQuestions();
    const gstQuestion = s.conversation.find((item) => item.kind === "clarification" && item.refs.questionId === "clar-gst")!;
    const approvalQuestion = s.conversation.find((item) => item.kind === "clarification" && item.refs.questionId === "clar-approval")!;
    s = await svc.buyerReply({ inReplyTo: gstQuestion.id, scriptId: "clar-gst-unclear" });
    const unclear = s.conversation.at(-1)!;
    s = await svc.buyerReply({ inReplyTo: approvalQuestion.id, scriptId: "clar-approval-contract" });
    const before = commercialSnapshot(s);

    s = await svc.askClarificationAgain(unclear.id);
    const followUp = [...s.conversation].reverse().find((item) => item.kind === "clarification" && item.refs.questionId === "clar-gst")!;
    expect(followUp).toMatchObject({ author: "code", state: "approved_and_sent_by_merchant", sentAt: expect.any(String) });
    expect(followUp.id).not.toBe(gstQuestion.id);
    expect(s.events.at(-1)).toMatchObject({ kind: "clarification_follow_up", provenance: "merchant" });
    expect(s.interpretations).toEqual([]);
    expect(commercialSnapshot(s)).toEqual(before);
    expect(await svc.progressOf(s)).toMatchObject({ kind: "waiting_on_buyer", rule: "understand.waiting" });

    s = await svc.buyerReply({ inReplyTo: followUp.id, scriptId: "clar-gst-no" });
    s = await svc.adoptRepliesAsAnswers();
    expect(svc.decisionAnswers(s).map((answer) => answer.value)).toEqual(["no", "per_contract"]);
    expect((await svc.currentOutcome(s)).evaluation.state).toBe("options_ready");
  });
});
