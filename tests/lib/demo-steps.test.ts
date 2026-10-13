import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { demoStepConsequence, nextDemoStep, replyContext } from "@/lib/demo-steps";
import { driveTo } from "../helpers/drive";

/**
 * Spec §8.1 and plan Task 13: the demo bar navigates for merchant and buyer decisions, executes only
 * labelled system events and simulated replies, and follows the canonical preventive storyboard.
 */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-demo-"));
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic"; // pinned to the labelled hand-written sample: this suite asserts that run
const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
  throw new Error("no network");
});
type Svc = typeof import("@/lib/service");
let svc: Svc;
beforeAll(async () => {
  svc = await import("@/lib/service");
});
afterAll(() => fetchSpy.mockRestore());
const step = async () => {
  const s = await svc.getState();
  return nextDemoStep(s, await svc.progressOf(s), "hero");
};

describe("demo steps never perform merchant or buyer decisions", () => {
  it("names the actor and consequence before an executable system step", () => {
    expect(demoStepConsequence({ type: "system", label: "Simulate: buyer pays the upfront link" })).toBe("Simulated system event · buyer pays the upfront link");
    expect(demoStepConsequence({ type: "buyer", label: "Next: simulated buyer reply to the question" })).toBe("Simulated buyer action · buyer reply to the question");
    expect(demoStepConsequence({ type: "merchant", label: "Next: review the buyer proposal" })).toBe("Merchant action · review the buyer proposal");
  });
  it("points the merchant at confirming the required services without performing it", () => {
    const step = nextDemoStep({} as never, { rule: "understand.scope", stage: "understand" } as never, "hero");
    expect(step).toMatchObject({ id: "confirm_required_services", type: "merchant", systemAction: null, usesReplyControl: false, href: "/deals/hero/understand" });
    expect(step!.label).toBe("Next: confirm the services the buyer requires");
  });
  it("merchant steps only navigate", async () => {
    await svc.resetToSeed();
    const st = (await step())!;
    expect([st.type, st.systemAction, st.href, st.label]).toEqual(["merchant", null, "/deals/hero/understand", "Next: send the questions to the buyer"]);
  });
  it("the system endpoint refuses decisions", async () => {
    for (const id of ["send_questions", "review_buyer_proposal", "approve_and_send", "accept", "approve_revised_terms", "fail_debit"]) {
      await expect(svc.runSystemStep(id as never)).rejects.toThrow(/Not a system step/);
    }
  });
  it("buyer steps open the buyer page and are never executed by the bar", async () => {
    await svc.resetToSeed();
    await driveTo(svc, (x) => x.status === "sent");
    const st = (await step())!;
    expect([st.type, st.systemAction, st.href]).toEqual(["buyer", null, "/proposal/agr-hero/v1"]);
  });

  it("guides an already-prepared draft to the exact merchant preview", async () => {
    await svc.resetToSeed();
    await driveTo(svc, (x) => x.status === "options_ready");
    await svc.reviewBuyerProposal();
    const st = (await step())!;
    expect([st.id, st.type, st.href, st.systemAction]).toEqual(["approve_and_send_draft", "merchant", "/deals/hero/offer/preview", null]);
    expect(st.label).toContain("approve and send");
  });
});

describe("buyer setup gate and explicit time", () => {
  it("cannot reach the notice while buyer setup is incomplete", async () => {
    await svc.resetToSeed();
    await driveTo(svc, (x) => x.status === "active"); // accepted: link unpaid, mandate pending
    // The buyer pays and sets up automatic payment on their own page; the guide only points there.
    expect(await step()).toMatchObject({ id: "buyer_setup", type: "buyer", systemAction: null, href: "/proposal/agr-hero/v1" });
    for (const id of ["advance_to_notice", "send_notice"] as const) await expect(svc.runSystemStep(id)).rejects.toThrow(/Buyer setup is not complete/);
    await svc.simulate("payment_link_paid");
    // Half-done setup still belongs to the buyer's page.
    expect(await step()).toMatchObject({ id: "buyer_setup", type: "buyer", systemAction: null });
    for (const id of ["advance_to_notice", "send_notice"] as const) await expect(svc.runSystemStep(id)).rejects.toThrow(/Buyer setup is not complete/);
    await svc.buyerCompleteSetup();
    expect((await step())!.systemAction).toBe("advance_to_notice");
  });
  it("time advancement is its own recorded step before the notice", async () => {
    const st = (await step())!;
    expect(st.label).toBe("Advance simulated date to 28 Nov 2026");
    const s = await svc.runSystemStep("advance_to_notice");
    expect(s.clockAdvances.at(-1)!.to).toBe("2026-11-28T10:00:00+05:30");
    expect(s.run.record.clockAdvances.at(-1)!.to).toBe("2026-11-28T10:00:00+05:30");
    expect(s.conversation.some((i) => i.kind === "notice")).toBe(false);
    expect((await step())!.systemAction).toBe("send_notice");
    const after = await svc.runSystemStep("send_notice");
    expect(after.clockAdvances).toHaveLength(s.clockAdvances.length); // no hidden second advance
    expect(after.conversation.some((i) => i.kind === "notice")).toBe(true);
  });
});

describe("canonical preventive storyboard", () => {
  it("offers the buyer's notice reply before advancing to another instalment", async () => {
    await svc.resetToSeed();
    await driveTo(svc, (x) => x.status === "active");
    await svc.runSystemStep("pay_upfront_link");
    await svc.runSystemStep("confirm_mandate");
    await svc.runSystemStep("advance_to_notice");
    const s = await svc.runSystemStep("send_notice");
    const recurring = s.attempts.find((a) => a.method === "recurring_debit")!;
    const notice = s.notices.find((n) => n.attemptId === recurring.id)!;
    s.attempts.push({ ...recurring, id: "later-instalment", dueDate: "2027-01-01" });
    s.notices.push({ ...notice, id: "later-notice", attemptId: "later-instalment", dueDate: "2027-01-01", sendOn: "2026-12-29", sentAt: null });

    const next = nextDemoStep(s, await svc.progressOf(s), "hero");
    expect(next).toMatchObject({ id: "buyer_reply", type: "buyer", systemAction: null, usesReplyControl: true });
    expect(replyContext(s)?.inReplyTo).toBe(s.conversation.find((m) => m.kind === "notice")!.id);
  });

  it("runs end to end with explicit decisions and never offers a failed debit", async () => {
    await svc.resetToSeed();
    const ids: string[] = [];
    for (let i = 0; i < 40; i++) {
      const st = await step();
      if (!st) break;
      // The first phase's story ends with the payment moved and agreed; the review that follows has its own test below.
      if (st.id === "collect_payment") break;
      expect(st.label).not.toMatch(/fail/i);
      if (ids.at(-1) !== st.id) ids.push(st.id);
      if (st.systemAction) await svc.runSystemStep(st.systemAction);
      else {
        const before = (await svc.getState()).events.length;
        await driveTo(svc, (x) => x.events.length !== before, 2, "preventive");
      }
    }
    expect(ids).toEqual([
      "send_questions",
      "buyer_reply",
      "use_answers",
      "review_buyer_proposal",
      "buyer_accept",
      "buyer_setup",
      "advance_to_notice",
      "send_notice",
      "buyer_reply",
      "draft_revised_terms",
      "review_revised_terms",
      "buyer_accept_revision",
    ]);
    const s = await svc.getState();
    expect(s.attempts.some((a) => a.status === "failed" || a.origin === "internal_retry")).toBe(false);
    expect(s.changeRequests[0]).toMatchObject({ timing: "preventive", unavailableUntil: "2026-12-20", earliestDebit: "2026-12-21" });
    const reply = s.conversation.find((i) => i.id === s.changeRequests[0].replyId)!;
    expect(reply.createdAt).toBe("2026-11-28T12:30:00+05:30");
    expect(s.conversation.find((i) => i.id === reply.inReplyTo)?.kind).toBe("notice");
    expect(s.attempts.filter((a) => a.scheduleLineId === "pay-2").map((a) => [a.dueDate, a.status])).toEqual([
      ["2026-12-01", "removed"],
      ["2026-12-21", "scheduled"],
    ]);
    expect((await svc.progressOf(s)).headline).toBe("Up to date · next payment ₹23,010 on 21 Dec 2026.");
  });
});

describe("simulated buyer reply control", () => {
  it("offers replies only when one is expected, for the message awaiting it", async () => {
    let s = await svc.resetToSeed();
    expect(replyContext(s)).toBeNull(); // questions not sent yet
    s = await svc.sendQuestions();
    const ctx = replyContext(s)!;
    expect(ctx.scripts.map((x) => x.id)).toEqual(["clar-gst-yes", "clar-gst-no", "clar-gst-unclear"]);
    expect(s.conversation.find((i) => i.id === ctx.inReplyTo)?.refs.questionId).toBe("clar-gst");
    await driveTo(svc, (x) => x.conversation.some((i) => i.kind === "notice"));
    s = await svc.getState();
    const n = replyContext(s)!;
    expect(s.conversation.find((i) => i.id === n.inReplyTo)?.kind).toBe("notice");
    expect(n.scripts[0].id).toBe("notice-cash-tight");
  });
  it("made no network or model call", () => expect(fetchSpy).not.toHaveBeenCalled());

  it("goes on past the moved payment to the month-three review, one labelled step at a time, and ends with the rest of the year accepted", async () => {
    await svc.resetToSeed();
    const ids: string[] = [];
    for (let i = 0; i < 40; i++) {
      const st = await step();
      if (!st) break;
      expect(st.label).not.toMatch(/fail/i);
      if (ids.at(-1) !== st.id) ids.push(st.id);
      if (st.systemAction) await svc.runSystemStep(st.systemAction);
      else {
        const before = (await svc.getState()).events.length;
        const state = await svc.getState();
        if (st.id === "send_follow_on") await svc.sendFollowOn({ conditionMet: true });
        else if (st.id === "buyer_reply" && state.conversation.some((m) => m.kind === "review" && !state.conversation.some((r) => r.inReplyTo === m.id))) {
          await svc.buyerReply({ inReplyTo: state.conversation.findLast((m) => m.kind === "review")!.id, scriptId: "review-proceed" });
        } else if (st.id === "buyer_decide") {
          const v = state.agreements.at(-1)!;
          await svc.acceptAgreement(v.version, v.termsHash, true);
          await svc.buyerCompleteSetup();
        } else await driveTo(svc, (x) => x.events.length !== before, 2, "preventive");
      }
    }
    expect(ids.slice(-5)).toEqual(["collect_payment", "advance_to_review", "buyer_reply", "send_follow_on", "buyer_decide"]);
    const s = await svc.getState();
    expect(s.agreements.at(-1)).toMatchObject({ version: 3, status: "active", continuesFrom: 2 });
    expect(s.mandate).toMatchObject({ agreementVersion: 3, status: "confirmed" });
    expect((await svc.progressOf(s)).headline).toBe("Up to date · next payment ₹28,320 on 1 May 2027.");
    expect(await step()).toBeNull();
  });

  it("on the recommended single payment, goes from the payment straight to the review and ends at the buyer's choice", async () => {
    await svc.resetToSeed();
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) {
      const st = await step();
      if (!st) break;
      if (ids.at(-1) !== st.id) ids.push(st.id);
      const state = await svc.getState();
      if (st.systemAction) await svc.runSystemStep(st.systemAction);
      else if (st.id === "buyer_reply" && state.conversation.some((m) => m.kind === "review")) {
        await svc.buyerReply({ inReplyTo: state.conversation.findLast((m) => m.kind === "review")!.id, scriptId: "review-proceed" });
      } else if (st.id === "send_follow_on") await svc.sendFollowOn({ conditionMet: true });
      else if (st.id === "buyer_accept" || st.id === "buyer_decide") {
        const v = state.agreements.find((a) => a.status === "sent")!;
        await svc.acceptAgreement(v.version, v.termsHash, true);
        await svc.buyerCompleteSetup();
      } else if (st.id === "buyer_setup") await svc.buyerCompleteSetup();
      else {
        const before = state.events.length;
        await driveTo(svc, (x) => x.events.length !== before, 2, "preventive", { offer: "recommended" });
      }
      if (st.id === "buyer_decide") break;
    }
    expect(ids).toEqual(["send_questions", "buyer_reply", "use_answers", "review_buyer_proposal", "buyer_accept", "advance_to_review", "buyer_reply", "send_follow_on", "buyer_decide"]);
    const s = await svc.getState();
    expect(s.attempts.filter((a) => a.agreementVersion === 1).map((a) => a.status)).toEqual(["succeeded"]);
    expect(s.agreements.at(-1)).toMatchObject({ version: 2, status: "active", continuesFrom: 1 });
  });
});
