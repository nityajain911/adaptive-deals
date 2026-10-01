import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertBuyerSafe } from "@/domain/conversation";
import { formatINR } from "@/domain/money";

/**
 * Connected buyer journey through the service and real store. Uses the default displayed demo
 * run (the committed actual Groq run), so it exercises the live-run application state; no model
 * or network call is allowed anywhere in this suite.
 */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-connected-"));
delete process.env.ADAPTIVE_DEALS_DEMO_RUN;
process.env.GROQ_API_KEY = "gsk_test_not_a_real_key_never_used";

type Svc = typeof import("@/lib/service");
let svc: Svc;
const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
  throw new Error("No network call is allowed in the connected journey");
});

beforeAll(async () => {
  svc = await import("@/lib/service");
});
afterAll(() => {
  fetchSpy.mockRestore();
  delete process.env.GROQ_API_KEY;
});

const S = () => svc.getState();
const item = async (pred: (i: Awaited<ReturnType<Svc["getState"]>>["conversation"][number]) => boolean) => (await S()).conversation.find(pred)!;
const snapshot = async () => {
  const s = await S();
  return JSON.stringify({ attempts: s.attempts, paymentLinks: s.paymentLinks, agreements: s.agreements, mandate: s.mandate, amendments: s.amendments });
};

describe("connected buyer journey (live-run application state)", () => {
  it("seeds AI-suggested drafts that are not sent until the merchant sends them", async () => {
    const s = await svc.resetToSeed();
    expect(s.run.record.kind).toBe("live");
    const drafts = s.conversation.filter((i) => i.kind === "clarification");
    expect(drafts.map((d) => [d.state, d.author, d.sentAt])).toEqual([
      ["suggested_by_ai", "ai", null],
      ["suggested_by_ai", "ai", null],
    ]);
    await expect(svc.buyerReply({ inReplyTo: drafts[0].id, scriptId: "clar-gst-yes" })).rejects.toThrow(/sent/);
  });

  it("pausing suggestions stops new AI drafts; resuming is explicit", async () => {
    let s = await svc.setSuggestionsPaused(true);
    expect(s.suggestionsPaused).toBe(true);
    s = await svc.setSuggestionsPaused(false);
    expect(s.conversation.filter((i) => i.kind === "clarification")).toHaveLength(2); // no duplicates on resume
  });

  it("merchant sends, buyer replies (scripted), replies become the confirmed answers", async () => {
    for (const d of (await S()).conversation.filter((i) => i.kind === "clarification")) await svc.sendClarification(d.id);
    expect((await S()).conversation.filter((i) => i.state === "approved_and_sent_by_merchant")).toHaveLength(2);
    const gst = await item((i) => i.refs.questionId === "clar-gst");
    const ap = await item((i) => i.refs.questionId === "clar-approval");
    await expect(svc.adoptRepliesAsAnswers()).rejects.toThrow(/Waiting for the buyer's reply/);
    await svc.buyerReply({ inReplyTo: gst.id, scriptId: "clar-gst-yes" });
    await expect(svc.buyerReply({ inReplyTo: ap.id, scriptId: "clar-gst-yes" })).rejects.toThrow(/different question/);
    await svc.buyerReply({ inReplyTo: ap.id, scriptId: "clar-approval-contract" });
    const s = await svc.adoptRepliesAsAnswers();
    expect(s.status).toBe("options_ready");
    expect(s.run.record.inputs.answers.map((a) => [a.questionId, a.value, a.confirmedByBuyerVia])).toEqual([
      ["clar-gst", "yes", "whatsapp"],
      ["clar-approval", "per_contract", "whatsapp"],
    ]);
  });

  it("a proposal link exists only after merchant approval; “Okay” accepts nothing", async () => {
    expect((await S()).conversation.some((i) => i.kind === "proposal")).toBe(false);
    const top = (await svc.currentOutcome(await S())).explanation!.order[0];
    const draft = await svc.prepareAgreement(top);
    expect((await S()).conversation.some((i) => i.kind === "proposal")).toBe(false);
    await svc.approveAndSend(draft.version, draft.termsHash);
    const proposal = await item((i) => i.kind === "proposal");
    expect(proposal).toMatchObject({ state: "sent_by_adaptive_deals", author: "code", refs: { agreementVersion: 1 } });
    expect(proposal.text).toContain("/proposal/agr-hero/v1");
    await svc.buyerReply({ inReplyTo: proposal.id, scriptId: "proposal-okay" });
    const s = await S();
    expect(s.status).toBe("sent");
    expect(s.agreements[0].buyerAcceptance).toBeNull();
  });

  it("request a change records a linked event and leaves terms untouched", async () => {
    const before = (await S()).agreements[0];
    const s = await svc.requestChange(1, "Could the first payment move to 15 November?");
    expect(s.agreements[0]).toEqual(before);
    expect(s.conversation.at(-1)).toMatchObject({ kind: "change_request", source: "buyer_proposal_page", inReplyTo: (await item((i) => i.kind === "proposal")).id, refs: { agreementVersion: 1 } });
  });

  it("acceptance of the exact version sets up payment; notice is code-authored", async () => {
    const v = (await S()).agreements[0];
    await svc.acceptAgreement(1, v.termsHash, true);
    await svc.simulate("mandate_confirmed");
    const s = await svc.simulate("advance_notice");
    expect(s.conversation.find((i) => i.kind === "payment")).toMatchObject({ author: "code" });
    expect(s.conversation.find((i) => i.kind === "notice")).toMatchObject({ author: "code", state: "sent_by_adaptive_deals", refs: { noticeId: s.notices[0].id } });
  });

  it("“I paid”, “Okay” and unsupported replies change no payment, attempt, ledger or agreement", async () => {
    const notice = await item((i) => i.kind === "notice");
    for (const scriptId of ["notice-paid", "notice-okay", "notice-amount", "notice-tak", "notice-next-week"]) {
      const before = await snapshot();
      const s = await svc.buyerReply({ inReplyTo: notice.id, scriptId });
      expect(await snapshot()).toBe(before);
      expect(s.changeRequests).toHaveLength(0);
    }
    const kinds = (await S()).conversation.filter((i) => i.inReplyTo === notice.id).map((i) => i.classification!.kind);
    expect(kinds).toEqual(["payment_claimed", "acknowledgement", "needs_attention", "needs_attention", "needs_attention"]);
    expect((await S()).events.map((e) => e.title)).toEqual(expect.arrayContaining(["Payment claimed — verification required", "Acknowledgement only", "Merchant attention needed"]));
  });

  it("preventive restructuring: change requested → draft amendment → two approvals → payment rescheduled", async () => {
    const notice = await item((i) => i.kind === "notice");
    let s = await svc.buyerReply({ inReplyTo: notice.id, scriptId: "notice-cash-tight" });
    expect(s.changeRequests[0]).toMatchObject({ state: "change_requested", scheduleLineId: "pay-2", unavailableUntil: "2026-12-20", earliestDebit: "2026-12-21", timing: "preventive" });
    const original = s.attempts.find((a) => a.scheduleLineId === "pay-2")!;
    expect(original.status).toBe("scheduled");

    s = await svc.proposeAmendment();
    expect(s.changeRequests[0].state).toBe("draft_amendment");
    const a = s.amendments[0];
    expect(a).toMatchObject({ trigger: "buyer_message", change: { lineId: "pay-2", fromDueDate: "2026-12-01", toDueDate: "2026-12-21" } });
    expect(a.revised.buyerChecks.map((c) => c.id)).toEqual(expect.arrayContaining(["buyer_budget", "buyer_timing", "buyer_approval"]));
    expect(a.revised.sellerChecks.map((c) => c.id)).toEqual(expect.arrayContaining(["seller_contribution", "seller_cash_at_risk"]));
    expect(a.mandateFit.fits).toBe(true);
    expect(s.attempts.find((x) => x.id === original.id)!.status).toBe("scheduled"); // still there after the draft

    const v2 = s.agreements.find((v) => v.version === 2)!;
    s = await svc.approveAmendment(v2.termsHash);
    expect(s.attempts.find((x) => x.id === original.id)!.status).toBe("scheduled"); // still there after merchant approval
    const amendMsg = s.conversation.find((i) => i.kind === "amendment")!;
    await svc.buyerReply({ inReplyTo: amendMsg.id, text: "Okay" });
    s = await S();
    expect(s.amendments[0].state).toBe("merchant_approved"); // “Okay” is not acceptance
    expect(s.attempts.find((x) => x.id === original.id)!.status).toBe("scheduled");

    s = await svc.acceptAmendment(v2.termsHash, true);
    expect(s.attempts.find((x) => x.id === original.id)!.status).toBe("removed");
    const pay2 = s.attempts.filter((x) => x.scheduleLineId === "pay-2" && x.status === "scheduled");
    expect(pay2).toHaveLength(1);
    expect(pay2[0]).toMatchObject({ dueDate: "2026-12-21", agreementVersion: 2, origin: "amendment" });
    expect(s.attempts.find((x) => x.scheduleLineId === "pay-1")!.status).toBe("scheduled"); // unchanged line untouched
    expect(s.changeRequests[0].history.map((h) => h.state)).toEqual(["change_requested", "draft_amendment", "payment_rescheduled"]);
    expect(s.amendments[0].history.map((h) => h.state)).toEqual(["proposed", "merchant_approved", "buyer_accepted", "collection_updated", "active"]);
    expect(s.events.some((e) => e.title === "Payment rescheduled")).toBe(true);
  });

  it("collection update is not repeatable and never overlaps", async () => {
    const v2 = (await S()).agreements.find((v) => v.version === 2)!;
    await expect(svc.acceptAmendment(v2.termsHash, true)).rejects.toThrow(/No revision awaiting/);
    const s = await S();
    for (const line of ["pay-1", "pay-2"]) expect(s.attempts.filter((a) => a.scheduleLineId === line && (a.status === "scheduled" || a.status === "submitted"))).toHaveLength(1);
  });

  it("no buyer-facing message carries internal economics or policy", async () => {
    const s = await S();
    const out = await svc.currentOutcome(s);
    const internalFigures = out.evaluation.result!.feasible.flatMap((x) => [x.economics.netContributionPaise, x.economics.directCostPaise]).map((p) => formatINR(p));
    for (const i of s.conversation.filter((x) => x.direction === "outbound")) {
      expect(() => assertBuyerSafe(i.text)).not.toThrow();
      for (const f of internalFigures) expect(i.text).not.toContain(f);
    }
  });

  it("attribution: AI only for AI-written drafts; code for system messages; buyer replies are simulated", async () => {
    const s = await S();
    for (const i of s.conversation) {
      if (i.kind === "clarification") expect(i.author).toBe(i.state === "suggested_by_ai" || i.state === "approved_and_sent_by_merchant" ? "ai" : "code");
      else if (i.direction === "outbound") expect([i.author, i.state]).toEqual(["code", "sent_by_adaptive_deals"]);
      else expect([i.author, i.provenance]).toEqual(["buyer", "simulated"]);
    }
  });

  it("made no network or model call", () => {
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("typed replies use the same bounded path in replay and live-run states", () => {
  async function typedNoticeReplies(demoRun: string | undefined) {
    if (demoRun) process.env.ADAPTIVE_DEALS_DEMO_RUN = demoRun;
    else delete process.env.ADAPTIVE_DEALS_DEMO_RUN;
    await svc.resetToSeed();
    for (let i = 0; i < 10 && !(await S()).conversation.some((x) => x.kind === "notice"); i++) await svc.demoNext();
    const notice = (await S()).conversation.find((x) => x.kind === "notice")!;
    const out: string[] = [];
    for (const text of ["Cash is tight till the 20th.", "I paid", "okay", "20 tak"]) {
      await svc.buyerReply({ inReplyTo: notice.id, text });
      const r = (await S()).conversation.at(-1)!;
      out.push(`${r.scripted}:${r.classification!.kind}`);
    }
    return { kind: (await S()).run.record.kind, out };
  }
  it("synthetic replay and live-run states classify typed replies identically", async () => {
    const live = await typedNoticeReplies(undefined);
    const synthetic = await typedNoticeReplies("synthetic");
    expect(live.kind).toBe("live");
    expect(synthetic.kind).toBe("synthetic_replay");
    expect(live.out).toEqual(synthetic.out);
    expect(live.out).toEqual(["false:change_requested", "false:payment_claimed", "false:acknowledgement", "false:needs_attention"]);
    expect(fetchSpy).not.toHaveBeenCalled();
    delete process.env.ADAPTIVE_DEALS_DEMO_RUN;
  });
});

describe("decline", () => {
  it("records buyer rejection and creates no payment setup", async () => {
    await svc.resetToSeed();
    for (let i = 0; i < 6 && (await S()).status !== "sent"; i++) await svc.demoNext();
    const s = await svc.declineAgreement(1);
    expect(s.status).toBe("buyer_rejected");
    expect(s.agreements[0]).toMatchObject({ status: "buyer_rejected", buyerAcceptance: null });
    expect(s.agreements[0].buyerDecline).toBeDefined();
    expect([s.paymentLinks, s.attempts, s.mandate]).toEqual([[], [], null]);
    await expect(svc.acceptAgreement(1, s.agreements[0].termsHash, true)).rejects.toThrow();
  });
});
