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
    await expect(svc.sendFollowOn()).rejects.toThrow(/The review is on 1 Feb 2027/);
  });

  it("is due on the review date, with one action for the merchant", async () => {
    await firstPhasePaid();
    await svc.runSystemStep("advance_to_review");
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
    const s = await svc.sendFollowOn();
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
    await expect(svc.sendFollowOn()).rejects.toThrow(/already been sent/);
  });

  it("is accepted and paid on the buyer's page, then collected on its own dates, and the deal closes in the second phase", async () => {
    await firstPhasePaid();
    await svc.runSystemStep("advance_to_review");
    await svc.sendFollowOn();
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
    await svc.sendFollowOn();
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
    await svc.sendFollowOn();
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
    await expect(svc.sendFollowOn()).rejects.toThrow();
  });

  it("lets the buyer carry on: accept and pay, a setup of its own, and the deal closes in the second phase", async () => {
    await paidInOneGo();
    await svc.runSystemStep("advance_to_review");
    await svc.sendFollowOn();
    const v3 = (await svc.getState()).agreements.at(-1)!;
    await svc.acceptAgreement(v3.version, v3.termsHash, true);
    await svc.buyerCompleteSetup();
    expect((await progress()).rule).toBe("track.next_payment");
    await svc.simulate("debit_succeeded");
    await svc.simulate("debit_succeeded");
    expect(await progress()).toMatchObject({ rule: "track.fully_paid", headline: "Both phases collected. This deal is complete." });
  });
});
