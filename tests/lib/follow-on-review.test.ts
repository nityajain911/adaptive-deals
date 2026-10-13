import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { driveTo } from "../helpers/drive";

/**
 * Two phases, and the deal closes in the second. The first phase is sold and collected; the rest of the year is held at today's
 * rates, and after the month-three review the merchant sends it as its own version, which the buyer accepts and pays on their own
 * page with a payment setup of its own.
 */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-review-"));
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic";
type Svc = typeof import("@/lib/service");
let svc: Svc;
let presenter: typeof import("@/lib/presenter-store");
const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
  throw new Error("no network");
});
beforeAll(async () => {
  svc = await import("@/lib/service");
  presenter = await import("@/lib/presenter-store");
});
afterAll(() => fetchSpy.mockRestore());
beforeEach(async () => {
  await svc.resetToSeed();
  await presenter.setFailNextSend(false);
});

const progress = async () => svc.progressOf(await svc.getState());
/** The first phase, paid in full: the reschedule agreed, then the last payment collected. */
async function firstPhasePaid() {
  await driveTo(svc, (x) => x.amendments.at(-1)?.state === "active");
  await svc.simulate("debit_succeeded");
}

describe("the month-three review", () => {
  it("waits for the review, and refuses to send before it", async () => {
    await firstPhasePaid();
    expect((await progress()).rule).toBe("track.follow_on_waiting");
    await expect(svc.sendFollowOn({ conditionMet: true })).rejects.toThrow(/The review is on 1 Feb 2027/);
  });

  it("is due on the review date, with one action for the merchant", async () => {
    await firstPhasePaid();
    await svc.runSystemStep("advance_to_review");
    // The review message has gone out; the merchant waits for what the buyer says.
    expect((await progress()).rule).toBe("track.follow_on_awaiting_buyer");
    const review = (await svc.getState()).conversation.findLast((m) => m.kind === "review")!;
    await svc.buyerReply({ inReplyTo: review.id, scriptId: "review-proceed" });
    const p = await progress();
    expect(p.rule).toBe("track.follow_on_due");
    expect(p.primaryAction).toEqual({ id: "send_follow_on", label: "Send the rest of the year" });
    expect(p.headline).toContain("₹84,960");
    expect(p.headline).toContain("18 Mar 2027");
  });

  it("sends the rest of the year as its own version, with its own payments, held exactly as approved", async () => {
    await firstPhasePaid();
    await svc.runSystemStep("advance_to_review");
    const held = (await svc.getState()).agreements.find((v) => v.status === "active" && v.terms.followOn)!.terms.followOn!;
    const s = await svc.sendFollowOn({ conditionMet: true });
    const v3 = s.agreements.at(-1)!;
    expect(v3).toMatchObject({ version: 3, status: "sent", continuesFrom: 2 });
    expect(v3.terms.followOn).toBeUndefined(); // two phases only: nothing is held after this
    expect(v3.terms.pricing).toMatchObject({ prePaise: held.pricing.prePaise, gstPaise: held.pricing.gstPaise, totalPaise: held.pricing.totalPaise });
    expect(v3.terms.paymentSchedule.map((p) => [p.id, p.dueDate.value, p.method, p.totalPaise])).toEqual([
      ["p2-pay-1", "2027-02-01", "payment_link", 2_832_000],
      ["p2-pay-2", "2027-05-01", "recurring_debit", 2_832_000],
      ["p2-pay-3", "2027-08-01", "recurring_debit", 2_832_000],
    ]);
    expect(v3.terms.mandate).toMatchObject({ perDebitLimitPaise: 2_832_000, endDate: { value: "2027-09-30" } });
    expect(v3.terms.conditions).toContain("buyer_attests_required_approval");
    expect(v3.terms.excludedPackageIds).toEqual([]);
    expect(v3.merchantApproval?.termsHash).toBe(v3.termsHash);
    expect(s.status).toBe("sent");
    expect((await progress()).rule).toBe("track.sent_awaiting_buyer");
    await expect(svc.sendFollowOn({ conditionMet: true })).rejects.toThrow(/already been sent/);
  });

  it("is accepted and paid on the buyer's page, then collected on its own dates, and the deal closes in the second phase", async () => {
    await firstPhasePaid();
    await svc.runSystemStep("advance_to_review");
    await svc.sendFollowOn({ conditionMet: true });
    let s = await svc.getState();
    const v3 = s.agreements.at(-1)!;
    // The attestation of internal approval is part of accepting, because the rest of the year is above the buyer's approval limit.
    await expect(svc.acceptAgreement(v3.version, v3.termsHash, false)).rejects.toThrow(/internal approval/);
    await svc.acceptAgreement(v3.version, v3.termsHash, true);
    await svc.buyerCompleteSetup();
    s = await svc.getState();
    expect(s.status).toBe("active");
    expect(s.mandate).toMatchObject({ agreementVersion: 3, status: "confirmed" });
    expect(s.attempts.filter((a) => a.agreementVersion === 3).map((a) => [a.scheduleLineId, a.status])).toEqual([["p2-pay-1", "succeeded"], ["p2-pay-2", "scheduled"], ["p2-pay-3", "scheduled"]]);
    // The first phase's records are untouched.
    expect(s.attempts.filter((a) => a.agreementVersion < 3 && a.status === "succeeded")).toHaveLength(2);
    expect((await progress()).rule).toBe("track.next_payment");
    await svc.simulate("debit_succeeded");
    await svc.simulate("debit_succeeded");
    const done = await progress();
    expect(done).toMatchObject({ rule: "track.fully_paid", headline: "Both phases collected. This deal is complete." });
  });

  it("moves a payment of the rest of the year the same way as the first phase's, and still closes when both phases are collected", async () => {
    await firstPhasePaid();
    await svc.runSystemStep("advance_to_review");
    await svc.sendFollowOn({ conditionMet: true });
    const v3 = (await svc.getState()).agreements.at(-1)!;
    await svc.acceptAgreement(v3.version, v3.termsHash, true);
    await svc.buyerCompleteSetup();
    await svc.simulate("advance_notice");
    const notice = [...(await svc.getState()).conversation].reverse().find((m) => m.kind === "notice")!;
    await svc.buyerReply({ inReplyTo: notice.id, scriptId: "notice-cash-tight" });
    await svc.proposeAmendment();
    let s = await svc.getState();
    const draft = s.agreements.find((v) => v.status === "draft")!;
    expect(draft).toMatchObject({ version: 4, supersedes: 3, continuesFrom: 2 });
    await svc.approveAmendment(draft.termsHash);
    await svc.acceptAmendment(draft.termsHash, true);
    await svc.simulate("debit_succeeded");
    await svc.simulate("debit_succeeded");
    s = await svc.getState();
    expect((await svc.progressOf(s)).headline).toBe("Both phases collected. This deal is complete.");
  });
});

/** The hero path: the first phase is paid in one go, and at the review the buyer either carries on or stops. */
describe("one payment, then the buyer's choice at the review", () => {
  async function paidInOneGo() {
    await driveTo(svc, (x) => x.status === "active", 30, "preventive", { offer: "recommended" });
    await svc.buyerCompleteSetup();
  }

  it("recommends the single payment, with no automatic payment in the first phase", async () => {
    await driveTo(svc, (x) => x.status === "options_ready");
    const s = await svc.getState();
    expect(svc.strategyViewOf(s, await svc.currentOutcome(s)).leader!.structure.id).toBe("phased_scope:scope=web-search-report-3m,plan=upfront");
    await paidInOneGo();
    const v1 = (await svc.getState()).agreements[0];
    expect(v1.terms.paymentSchedule.map((p) => [p.method, p.totalPaise])).toEqual([["payment_link", 4_602_000]]);
    expect(v1.terms.mandate).toBeNull();
    expect(v1.terms.followOn).toMatchObject({ heldUntil: "2027-03-18" });
    expect((await progress()).rule).toBe("track.follow_on_waiting");
  });

  it("lets the buyer stop here: the deal closes after the first phase, which stays paid, and nothing more can be sent", async () => {
    await paidInOneGo();
    await svc.runSystemStep("advance_to_review");
    await svc.sendFollowOn({ conditionMet: true });
    const v3 = (await svc.getState()).agreements.at(-1)!;
    await svc.declineAgreement(v3.version, "budget");
    const s = await svc.getState();
    expect(s.status).toBe("buyer_rejected");
    expect(s.attempts.filter((a) => a.status === "succeeded")).toHaveLength(1);
    expect(s.mandate).toBeNull();
    const p = await progress();
    expect(p).toMatchObject({ rule: "track.stopped_after_first", kind: "terminal", headline: "The buyer chose to stop after the first phase. Nothing more is due, and the deal closes here." });
    expect(p.stages.track).toBe("completed");
    expect(s.events.at(-1)?.title).toBe(`The buyer chose to stop after the first phase (version ${v3.version})`);
    await expect(svc.sendFollowOn({ conditionMet: true })).rejects.toThrow();
  });

  it("lets the buyer carry on: accept and pay, a setup of its own, and the deal closes in the second phase", async () => {
    await paidInOneGo();
    await svc.runSystemStep("advance_to_review");
    await svc.sendFollowOn({ conditionMet: true });
    const v3 = (await svc.getState()).agreements.at(-1)!;
    await svc.acceptAgreement(v3.version, v3.termsHash, true);
    await svc.buyerCompleteSetup();
    expect((await progress()).rule).toBe("track.next_payment");
    await svc.simulate("debit_succeeded");
    await svc.simulate("debit_succeeded");
    expect(await progress()).toMatchObject({ rule: "track.fully_paid", headline: "Both phases collected. This deal is complete." });
  });

  it("asks the owner about the buyer's own condition: sending needs the confirmation, and 'not met' closes after the first phase", async () => {
    await paidInOneGo();
    await svc.runSystemStep("advance_to_review");
    const s0 = await svc.getState();
    const out = await svc.currentOutcome(s0);
    expect(svc.buyerConditionOf(out)).toContain("enquiries are up by about 20 a month by month three");
    // The product shows the condition and asks; it never decides, and it will not send on its own reading.
    await expect(svc.sendFollowOn()).rejects.toThrow(/Confirm that their condition was met/);
    await expect(svc.sendFollowOn({ conditionMet: false })).rejects.toThrow(/Confirm that their condition was met/);
    expect((await svc.getState()).agreements).toHaveLength(1);

    const s = await svc.closeFollowOn();
    expect(s.followOnClosed).toMatchObject({ reason: "condition_not_met" });
    expect(s.agreements).toHaveLength(1);
    expect(s.attempts.filter((a) => a.status === "succeeded")).toHaveLength(1);
    const p = await progress();
    expect(p).toMatchObject({ rule: "track.follow_on_closed", kind: "terminal" });
    expect(p.headline).toBe("You chose not to send the rest of the year because their condition was not met. Nothing more is due, and the deal closes after the first phase.");
    expect(p.stages.track).toBe("completed");
    await expect(svc.sendFollowOn({ conditionMet: true })).rejects.toThrow();
    await expect(svc.closeFollowOn()).rejects.toThrow(/already closed/);
  });

  it("records, with their words, that the owner confirmed the condition when sending", async () => {
    await paidInOneGo();
    await svc.runSystemStep("advance_to_review");
    const s = await svc.sendFollowOn({ conditionMet: true });
    expect(s.events.find((e) => e.kind === "follow_on_sent")?.detail).toContain("the merchant confirmed their condition was met: “");
  });

  it("sends the review message by itself on the review date, once, and says nothing internal", async () => {
    await paidInOneGo();
    await svc.runSystemStep("advance_to_review");
    const messages = (await svc.getState()).conversation.filter((m) => m.kind === "review");
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe("The first phase is done. Would you like to go ahead with the rest of the year? The rest of the year (₹84,960 including GST) stays open at today's rates until 18 Mar 2027. You can say yes, ask for a change, or stop here. Reply here.");
    await expect(svc.runSystemStep("advance_to_review")).resolves.toBeTruthy();
    expect((await svc.getState()).conversation.filter((m) => m.kind === "review")).toHaveLength(1);
  });

  async function reviewReply(scriptId: string) {
    await paidInOneGo();
    await svc.runSystemStep("advance_to_review");
    const review = (await svc.getState()).conversation.findLast((m) => m.kind === "review")!;
    await svc.buyerReply({ inReplyTo: review.id, scriptId });
    return svc.getState();
  }

  it("if the buyer says to proceed, the merchant is asked to send, with no condition to confirm: the buyer judged their own test", async () => {
    const s = await reviewReply("review-proceed");
    expect(svc.reviewOf(s).state).toBe("proceed");
    expect(await progress()).toMatchObject({ rule: "track.follow_on_due", primaryAction: { id: "send_follow_on" } });
    const sent = await svc.sendFollowOn(); // no confirmation needed once the buyer has said so
    expect(sent.agreements.at(-1)).toMatchObject({ status: "sent", continuesFrom: 1 });
    expect(sent.events.find((e) => e.kind === "follow_on_sent")?.detail).toContain("the buyer's reply: “Kabir: The pilot went well");
  });

  it("if the buyer says to stop, the merchant is asked to close, and closing ends the deal as completed after the first phase", async () => {
    const s = await reviewReply("review-stop");
    expect(svc.reviewOf(s).state).toBe("stop");
    expect(await progress()).toMatchObject({ rule: "track.follow_on_buyer_stop", primaryAction: { id: "close_follow_on", label: "Close after the first phase" } });
    const closed = await svc.closeFollowOn();
    expect(closed.followOnClosed).toMatchObject({ reason: "buyer_stopped" });
    expect(closed.events.at(-1)?.title).toBe("The buyer chose to stop after the pilot; the deal closes after the first phase");
    const p = await progress();
    expect(p).toMatchObject({ rule: "track.follow_on_closed", kind: "terminal", headline: "The buyer chose to stop after the pilot, and you closed the deal. Nothing more is due, and the deal closes after the first phase." });
    expect(p.stages.track).toBe("completed");
    expect(closed.agreements).toHaveLength(1);
  });

  async function previewOf(s: Awaited<ReturnType<typeof svc.getState>>) {
    const ctx = await import("@/lib/deal-context");
    return svc.followOnChangePreview(s, ctx.dealContextFor(s, await ctx.pinnedEconomicsOf(s)));
  }

  it("a buyer who carries on with a LOWER PRICE gets the options that reach it, nearest first, and each passes the rules", async () => {
    const s = await reviewReply("review-change-price");
    expect(svc.reviewOf(s).state).toBe("changes");
    expect(svc.reviewOf(s).reply?.refs.reviewChange).toEqual({ kind: "lower_price", targetPaise: 6_000_000 });
    expect(await progress()).toMatchObject({ rule: "track.follow_on_changes", primaryAction: { id: "send_follow_on" } });
    const preview = (await previewOf(s))!;
    expect(preview.request).toBe("They want the rest of the year at ₹60,000 or less.");
    expect(preview.options.map((o) => [o.id, o.label, o.totalPaise, o.within])).toEqual([
      ["remove:social-media", "Without Social media", 5_310_000, true],
      ["remove:social-media+monthly-reporting", "Without Social media and Monthly reporting", 4_248_000, true],
    ]);
    const sent = await svc.sendFollowOn({ optionId: "remove:social-media" });
    const v = sent.agreements.at(-1)!;
    expect(v).toMatchObject({ status: "sent", continuesFrom: 1 });
    expect(v.terms.scope.map((x) => x.packageId)).toEqual(["search-marketing", "monthly-reporting"]);
    expect(v.terms.excludedPackageIds).toEqual(["social-media"]);
    expect(v.terms.pricing.totalPaise).toBe(5_310_000);
    // Within the buyer's own ₹60,000 limit, so no MD attestation is asked of them.
    expect(v.terms.conditions).not.toContain("buyer_attests_required_approval");
    expect(sent.events.find((e) => e.kind === "follow_on_sent")?.title).toBe(`The rest of the year sent as version ${v.version} · without Social media, at the buyer's request`);
    await svc.acceptAgreement(v.version, v.termsHash, false);
    await svc.buyerCompleteSetup();
    expect((await svc.getState()).attempts.filter((a) => a.agreementVersion === v.version).map((a) => a.amountPaise)).toEqual([1_770_000, 1_770_000, 1_770_000]);
  });

  it("a buyer who carries on with a LATER START gets the same price from the date they asked for, in payments counted from it", async () => {
    const s = await reviewReply("review-change-date");
    expect(svc.reviewOf(s).reply?.refs.reviewChange).toEqual({ kind: "later_start", startDate: "2027-04-01" });
    const preview = (await previewOf(s))!;
    expect(preview.request).toBe("They ask to start on 1 Apr 2027 instead of 1 Feb 2027.");
    expect(preview.options).toEqual([{ id: "start:2027-04-01", label: "Start 1 Apr 2027", totalPaise: 8_496_000, instalments: 3, within: false, firstPaymentDate: "2027-04-01" }]);
    const v = (await svc.sendFollowOn({ optionId: "start:2027-04-01" })).agreements.at(-1)!;
    expect(v.terms.paymentSchedule.map((p) => p.dueDate.value)).toEqual(["2027-04-01", "2027-07-01", "2027-10-01"]);
    expect(v.terms.deliverySchedule[0].month.value).toBe("2027-04");
    expect(v.terms.pricing.totalPaise).toBe(8_496_000);
    // Still above their limit, so the attestation of their MD's approval is part of accepting.
    expect(v.terms.conditions).toContain("buyer_attests_required_approval");
  });

  it("a buyer who carries on leaving out a SERVICE gets exactly that, and sending something else is refused", async () => {
    const s = await reviewReply("review-change-scope");
    expect((await previewOf(s))!.options.map((o) => o.id)).toEqual(["remove:social-media"]);
    await expect(svc.sendFollowOn({ optionId: "remove:monthly-reporting" })).rejects.toThrow(/not available/);
    await expect(svc.sendFollowOn({ optionId: "remove:social-media" })).resolves.toBeTruthy();
  });

  it("sending as held is still possible after a change request", async () => {
    await reviewReply("review-change-price");
    const sent = await svc.sendFollowOn();
    expect(sent.agreements.at(-1)!.terms.pricing.totalPaise).toBe(8_496_000);
  });

  it("offers a buyer who wants to carry on no way to back out: closing is refused unless they said stop (or said nothing the product can read)", async () => {
    await reviewReply("review-proceed");
    await expect(svc.closeFollowOn()).rejects.toThrow(/nothing to close/);
    await svc.resetToSeed();
    await reviewReply("review-change-scope");
    await expect(svc.closeFollowOn()).rejects.toThrow(/nothing to close/);
  });

  it("refuses a change the buyer did not ask for", async () => {
    await reviewReply("review-proceed");
    await expect(svc.sendFollowOn({ optionId: "remove:social-media" })).rejects.toThrow(/has not asked for a change/);
  });

  it("a typed reply is read by the owner: no decision is guessed, and the owner confirms the condition before sending", async () => {
    await paidInOneGo();
    await svc.runSystemStep("advance_to_review");
    const review = (await svc.getState()).conversation.findLast((m) => m.kind === "review")!;
    await svc.buyerReply({ inReplyTo: review.id, text: "Let me talk to my MD and get back to you." });
    expect(svc.reviewOf(await svc.getState()).state).toBe("unclear");
    expect((await progress()).headline).toContain("The buyer replied. Read it, then send the rest of the year");
    await expect(svc.sendFollowOn()).rejects.toThrow(/Confirm that their condition was met/);
    await expect(svc.sendFollowOn({ conditionMet: true })).resolves.toBeTruthy();
  });
});
