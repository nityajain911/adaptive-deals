import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * End-to-end hero journey through the server-side service and the real JSON store, exactly as
 * the API routes drive it. Every result is computed; nothing here is a UI constant.
 */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-"));
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic"; // this suite asserts the bundled synthetic run
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.ADAPTIVE_DEALS_PROVIDER;
delete process.env.RAZORPAY_KEY_ID;

type Svc = typeof import("@/lib/service");
let svc: Svc;
beforeAll(async () => {
  svc = await import("@/lib/service");
});

describe("hero journey through the service", () => {
  it("seeds at clarifying with a synthetic replay of the stored run", async () => {
    const s = await svc.resetToSeed();
    expect(s.status).toBe("clarifying");
    expect(s.run.record.kind).toBe("synthetic_replay");
    expect(s.run.record.displayed.questions.map((q) => q.id)).toEqual(["clar-gst", "clar-approval"]);
  });

  it("refuses answers without every question, and records buyer-confirmed answers", async () => {
    await expect(svc.recordAnswers([{ questionId: "clar-gst", value: "yes", answerText: "Yes, both amounts include GST.", confirmedByBuyerVia: "whatsapp" }])).rejects.toThrow(/every clarification/);
    const s = await svc.recordAnswers([
      { questionId: "clar-gst", value: "yes", answerText: "Yes, both amounts include GST.", confirmedByBuyerVia: "whatsapp", answeredAt: "2026-10-01T09:20:00+05:30" },
      { questionId: "clar-approval", value: "per_contract", answerText: "₹60,000 is per contract.", confirmedByBuyerVia: "whatsapp", answeredAt: "2026-10-01T09:22:00+05:30" },
    ]);
    expect(s.status).toBe("options_ready");
    // Pinned answers reproduce the bundled synthetic run exactly: one continuous run.
    expect(JSON.parse(JSON.stringify(s.run.record))).toEqual(svc.bundledSyntheticRun());
  });

  it("refuses to select a rejected structure for preparation", async () => {
    // Updated for the split approval flow (spec §3.3): selection replaces prepareAgreement.
    await expect(svc.selectOption("split_payment:plan=monthly_12")).rejects.toThrow(/cannot be selected/);
  });

  it("approve and send requires the exact draft hash; buyer must accept the same hash", async () => {
    const s0 = await svc.getState();
    const top = (await svc.currentOutcome(s0)).evaluation.result!.feasible[0].structure.id;
    // Updated for the split approval flow (spec §3.3): select → draft → approve → send.
    await svc.selectOption(top);
    const draft = await svc.reviewBuyerProposal();
    await expect(svc.approveDraft(1, "0".repeat(64))).rejects.toThrow(/does not match/);
    expect((await svc.approveDraft(1, draft.termsHash)).status).toBe("approved");
    const sent = (await svc.sendProposal(1)).state;
    expect(sent.status).toBe("sent");
    await expect(svc.acceptAgreement(1, "f".repeat(64), true)).rejects.toThrow(/does not match/);
    await expect(svc.acceptAgreement(1, draft.termsHash, false)).rejects.toThrow(/authority/);
    const s = await svc.acceptAgreement(1, draft.termsHash, true);
    expect(s.status).toBe("active");
    const v1 = s.agreements[0];
    expect(v1.merchantApproval!.termsHash).toBe(v1.buyerAcceptance!.termsHash);
    expect(s.paymentLinks[0]).toMatchObject({ mode: "simulated", status: "created", amountPaise: 2_301_000 });
    expect(s.mandate).toMatchObject({ status: "pending", mode: "simulated", perDebitLimitPaise: 2_301_000, endDate: "2027-01-31" });
    expect(s.attempts.map((a) => [a.scheduleLineId, a.status])).toEqual([["pay-1", "scheduled"], ["pay-2", "scheduled"]]);
    expect(s.notices[0]).toMatchObject({ sendOn: "2026-11-28", sentAt: null });
  });

  it("runs the storyboard's later events through the same domain transitions", async () => {
    await expect(svc.simulate("debit_failed")).rejects.toThrow(/mandate must be confirmed/);
    await svc.simulate("payment_link_paid");
    await svc.simulate("mandate_confirmed");
    await svc.simulate("advance_notice");
    let s = await svc.simulate("debit_failed");
    expect(s.attempts.map((a) => [a.scheduleLineId, a.origin, a.status])).toEqual([
      ["pay-1", "agreement", "succeeded"],
      ["pay-2", "agreement", "failed"],
      ["pay-2", "internal_retry", "scheduled"],
    ]);
    s = await svc.simulate("buyer_reply");
    expect(s.extraMessages[0].inReplyTo).toBe(s.notices[0].id);
    expect(s.clockAdvances.map((a) => a.to)).toEqual(["2026-11-01T10:00:00+05:30", "2026-11-28T10:00:00+05:30", "2026-12-01T10:00:00+05:30", "2026-12-01T11:05:00+05:30"]);
  });

  it("amends with both approvals, removes the internal retry and schedules 21 Dec", async () => {
    let s = await svc.proposeAmendment();
    expect(s.status).toBe("amending");
    const a = s.amendments[0];
    expect(a.change).toEqual({ lineId: "pay-2", fromDueDate: "2026-12-01", toDueDate: "2026-12-21" });
    expect(a.mandateFit.fits).toBe(true);
    const v2 = s.agreements.find((v) => v.version === 2)!;
    s = await svc.approveAmendment(v2.termsHash);
    s = await svc.acceptAmendment(v2.termsHash, true);
    expect(s.status).toBe("active");
    expect(s.amendments[0].history.map((h) => h.state)).toEqual(["proposed", "merchant_approved", "buyer_accepted", "collection_updated", "active"]);
    expect(s.agreements.map((v) => [v.version, v.status])).toEqual([[1, "superseded"], [2, "active"]]);
    expect(s.attempts.find((x) => x.origin === "internal_retry")!.status).toBe("removed");
    expect(s.attempts.find((x) => x.origin === "amendment")).toMatchObject({ dueDate: "2026-12-21", status: "scheduled", agreementVersion: 2 });
    expect(s.events.some((e) => e.title === "Adaptive Deals retry removed; revised payment scheduled.")).toBe(true);
  });

  it("Run live without a key is refused with a reason, and nothing is relabelled", async () => {
    await expect(svc.startLiveRun()).rejects.toThrow(/CEREBRAS_API_KEY is not set/);
    expect((await svc.getState()).run.record.kind).toBe("synthetic_replay");
  });

  it("shows all four failure states from the engine", async () => {
    const states: Record<string, string> = {};
    for (const id of ["scenario-insufficient", "scenario-outside", "scenario-no-feasible"]) {
      const s = await svc.runScenario(id);
      states[id] = s.scenario!.record.engine.initial.state;
    }
    expect(states).toEqual({ "scenario-insufficient": "insufficient_information", "scenario-outside": "outside_templates", "scenario-no-feasible": "no_feasible_deal" });
    const fresh = await svc.resetToSeed();
    expect(fresh.run.record.engine.initial.state).toBe("ambiguous");
  });
});
