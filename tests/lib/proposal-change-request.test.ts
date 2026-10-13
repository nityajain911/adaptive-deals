import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { driveTo } from "../helpers/drive";

/**
 * The buyer asks for a change after the first-phase proposal is sent. Whatever the owner answers with, the rest of the year
 * stays held, so the month-three review still has something to send. The thread also reads in order: a question is never
 * stamped before the message it follows.
 */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-change-"));
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic";
type Svc = typeof import("@/lib/service");
let svc: Svc;
const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
  throw new Error("no network");
});
beforeAll(async () => {
  svc = await import("@/lib/service");
});
afterAll(() => fetchSpy.mockRestore());
beforeEach(async () => {
  await svc.resetToSeed();
});

async function sentProposal() {
  await driveTo(svc, (s) => s.status === "options_ready");
  const d = await svc.reviewBuyerProposal();
  await svc.approveDraft(d.version, d.termsHash);
  await svc.sendProposal(d.version);
  return (await svc.getState()).agreements.find((a) => a.status === "sent")!;
}
const sendCurrentDraft = async () => {
  const d = await svc.reviewBuyerProposal();
  await svc.approveDraft(d.version, d.termsHash);
  await svc.sendProposal(d.version);
  return (await svc.getState()).agreements.find((a) => a.status === "sent")!;
};

describe("the thread reads in order", () => {
  it("stamps the questions after the buyer's last message and before any answer", async () => {
    await sentProposal();
    const s = await svc.getState();
    const last = Math.max(...(await import("@/data/synthetic/cases")).demoCase("reduced-scope")!.deal.messages.map((m) => Date.parse(m.timestamp)));
    const questions = s.conversation.filter((i) => i.kind === "clarification");
    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) {
      expect(Date.parse(q.createdAt)).toBeGreaterThan(last);
      expect(Date.parse(q.sentAt!)).toBeGreaterThan(last);
    }
    for (const reply of s.conversation.filter((i) => i.kind === "buyer_reply" && i.inReplyTo && questions.some((q) => q.id === i.inReplyTo))) {
      expect(Date.parse(reply.createdAt)).toBeGreaterThan(Date.parse(questions.find((q) => q.id === reply.inReplyTo)!.sentAt!));
    }
    expect(questions[0].createdAt).toBe("2026-10-01T09:15:00+05:30");
  });
});

describe("a change the buyer asks for on the sent proposal", () => {
  it("is answered with a lower price that keeps the rest of the year held, unchanged", async () => {
    const v1 = await sentProposal();
    expect(v1.terms.followOn).toBeTruthy();
    await svc.requestChange(v1.version, "", "price", { kind: "price", targetPaise: 4_300_000, gstBasis: "including" });
    expect((await svc.progressOf(await svc.getState())).rule).toBe("track.buyer_request");
    await svc.makeCounterOffer(4_300_000, true, ["DISCOUNT_ABOVE_LIMIT"], { reason: "Repeat client" });
    const v2 = await sendCurrentDraft();
    expect(v2.version).toBe(2);
    expect(v2.terms.paymentSchedule.reduce((sum, p) => sum + p.totalPaise, 0)).toBe(4_300_000);
    expect(v2.terms.followOn).toEqual(v1.terms.followOn);
    expect(v2.termsHash).not.toBe(v1.termsHash);
  });

  it("is answered with a smaller scope that keeps the rest of the year held, unchanged", async () => {
    const v1 = await sentProposal();
    await svc.requestChange(v1.version, "", "price", { kind: "price", targetPaise: 3_700_000, gstBasis: "including" });
    const corridor = await svc.corridorFor({ requestedPaise: 3_700_000, gstBasis: "including" });
    const option = corridor.scopeChange;
    expect(option).toBeTruthy();
    await svc.answerWithScopeChange(option!.packageId);
    const v2 = await sendCurrentDraft();
    expect(v2.terms.scope.some((x) => x.packageId === option!.packageId)).toBe(false);
    expect(v2.terms.followOn).toEqual(v1.terms.followOn);
  });

  it("still reaches the month-three review after the buyer accepts the changed offer", async () => {
    const v1 = await sentProposal();
    await svc.requestChange(v1.version, "", "price", { kind: "price", targetPaise: 4_300_000, gstBasis: "including" });
    await svc.makeCounterOffer(4_300_000, true, ["DISCOUNT_ABOVE_LIMIT"], { reason: "Repeat client" });
    await sendCurrentDraft();
    const v2 = (await svc.getState()).agreements.find((a) => a.status === "sent")!;
    await svc.acceptAgreement(v2.version, v2.termsHash, v2.terms.conditions.includes("buyer_confirms_authority_for_phase_scope"));
    await svc.buyerCompleteSetup();
    await svc.runSystemStep("advance_to_review");
    const review = (await svc.getState()).conversation.findLast((m) => m.kind === "review")!;
    expect(review).toBeTruthy();
    await svc.buyerReply({ inReplyTo: review.id, scriptId: "review-proceed" });
    const p = await svc.progressOf(await svc.getState());
    expect(p.rule).toBe("track.follow_on_due");
    expect(p.headline).toContain("₹84,960");
  });
});
