import { beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Spec §3.3, §4: merchant interpretation of an unsupported clarification reply. */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-interp-"));
delete process.env.ADAPTIVE_DEALS_DEMO_RUN;
vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
  throw new Error("no network");
});
type Svc = typeof import("@/lib/service");
let svc: Svc;
beforeAll(async () => {
  svc = await import("@/lib/service");
});

describe("merchant interpretation", () => {
  it("requires a supported value and a verbatim quote; is labelled merchant judgement; leaves the AI run record untouched", async () => {
    await svc.resetToSeed();
    const s1 = await svc.sendQuestions();
    const gst = s1.conversation.find((i) => i.refs.questionId === "clar-gst")!;
    const s2 = await svc.buyerReply({ inReplyTo: gst.id, text: "yes they are with gst" });
    const reply = s2.conversation.at(-1)!;
    const runBefore = JSON.stringify(s2.run.record);
    await expect(svc.interpretClarificationReply(reply.id, "maybe", "with gst")).rejects.toThrow(/supported value/);
    await expect(svc.interpretClarificationReply(reply.id, "yes", "includes GST")).rejects.toThrow(/verbatim/);
    await expect(svc.interpretClarificationReply(reply.id, "yes", "   ")).rejects.toThrow(/verbatim/);
    const s3 = await svc.interpretClarificationReply(reply.id, "yes", "with gst");
    expect(s3.interpretations).toEqual([expect.objectContaining({ messageId: reply.id, questionId: "clar-gst", value: "yes", quote: "with gst", actor: "merchant" })]);
    expect(s3.events.at(-1)!.detail).toMatch(/merchant judgement/);
    expect(JSON.stringify(s3.run.record)).toBe(runBefore);
  });
  it("an interpreted answer is adopted with the verbatim quote as its recorded text", async () => {
    const s = await svc.getState();
    const ap = s.conversation.find((i) => i.refs.questionId === "clar-approval" && i.kind === "clarification")!;
    await svc.buyerReply({ inReplyTo: ap.id, scriptId: "clar-approval-contract" });
    const done = await svc.adoptRepliesAsAnswers();
    expect(done.run.record.inputs.answers.find((a) => a.questionId === "clar-gst")).toMatchObject({ value: "yes", answerText: "with gst" });
  });
});
