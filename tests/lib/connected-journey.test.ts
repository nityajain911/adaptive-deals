import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertBuyerSafe } from "@/domain/conversation";
import { formatINR } from "@/domain/money";
import { localDateOf } from "@/domain/dates";
import { driveTo, reviewTwoPayments } from "../helpers/drive";

/**
 * Connected buyer journey through the service and real store. Until additive per-case live runs
 * are recorded, the selected designed case uses its bundled synthetic replay. No model or network
 * call is allowed anywhere in this suite.
 */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-connected-"));
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic"; // pinned to the labelled hand-written sample: this suite asserts that run
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

describe("connected buyer journey (selected-case application state)", () => {
  it("seeds AI-suggested drafts that are not sent until the merchant sends them", async () => {
    const s = await svc.resetToSeed();
    expect(s.run.record.kind).toBe("synthetic_replay");
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

  it("a proposal link exists only after a successful delivery; “Okay” accepts nothing", async () => {
    // Updated for the split approval flow (spec §3.3, §5.5): the gate moved from approval to delivery.
    expect((await S()).conversation.some((i) => i.kind === "proposal")).toBe(false);
    const draft = await reviewTwoPayments(svc);
    expect((await S()).conversation.some((i) => i.kind === "proposal")).toBe(false);
    await svc.approveDraft(draft.version, draft.termsHash);
    expect((await S()).conversation.some((i) => i.kind === "proposal")).toBe(false); // approved, not yet delivered
    await svc.sendProposal(draft.version);
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
    expect((await svc.progressOf(s))).toMatchObject({ rule: "track.buyer_request", primaryAction: { label: "Review buyer request" } });
    const request = s.conversation.at(-1)!;
    const reviewed = await svc.reviewWork("message", request.id, "keep_current_terms", "Buyer chose to keep the original offer");
    expect(reviewed.agreements[0]).toEqual(before);
    expect((await svc.progressOf(reviewed)).rule).toBe("track.sent_awaiting_buyer");
  });

  it("acceptance of the exact version sets up payment; notice is code-authored", async () => {
    const v = (await S()).agreements[0];
    await svc.acceptAgreement(1, v.termsHash, true);
    await svc.simulate("mandate_confirmed");
    const s = await svc.simulate("advance_notice");
    const acceptance = s.outcomes.find((o) => o.type === "buyer_accepted" && o.version === 1);
    expect(acceptance).toMatchObject({ actor: "buyer", reasonCode: null, note: null, source: { kind: "event" } });
    expect(s.events.find((e) => e.id === acceptance?.source?.id)).toMatchObject({ kind: "buyer_accepted", title: "Buyer accepted version 1" });
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
    const revisionAcceptance = s.outcomes.find((o) => o.type === "buyer_accepted" && o.version === 2);
    expect(revisionAcceptance).toMatchObject({ actor: "buyer", reasonCode: null, note: null, source: { kind: "event" } });
    expect(s.events.find((e) => e.id === revisionAcceptance?.source?.id)).toMatchObject({ kind: "buyer_accepted", title: "Buyer accepted revision (version 2)" });
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

describe("typed replies use the same bounded path across selected-case resets", () => {
  async function typedNoticeReplies() {
    await svc.resetToSeed();
    await driveTo(svc, (x) => x.conversation.some((i) => i.kind === "notice"));
    const notice = (await S()).conversation.find((x) => x.kind === "notice")!;
    const out: string[] = [];
    for (const text of ["Cash is tight till the 20th.", "I paid", "okay", "20 tak"]) {
      await svc.buyerReply({ inReplyTo: notice.id, text });
      const r = (await S()).conversation.at(-1)!;
      out.push(`${r.scripted}:${r.classification!.kind}`);
    }
    return { kind: (await S()).run.record.kind, out };
  }
  it("classifies typed replies identically after two resets of the labelled sample", async () => {
    const first = await typedNoticeReplies();
    const second = await typedNoticeReplies();
    expect(first.kind).toBe("synthetic_replay");
    expect(second.kind).toBe("synthetic_replay");
    expect(first.out).toEqual(second.out);
    expect(first.out).toEqual(["false:change_requested", "false:payment_claimed", "false:acknowledgement", "false:needs_attention"]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("one open change request per payment under an agreement version", () => {
  const toNotice = async () => {
    await svc.resetToSeed();
    await driveTo(svc, (x) => x.conversation.some((i) => i.kind === "notice"));
    return (await S()).conversation.find((x) => x.kind === "notice")!;
  };
  /** Terms, attempts (the collection ledger), links, mandate, amendments, notices, status and change requests. */
  const material = async () => {
    const s = await S();
    return JSON.stringify({ attempts: s.attempts, paymentLinks: s.paymentLinks, agreements: s.agreements, mandate: s.mandate, amendments: s.amendments, notices: s.notices, status: s.status, changeRequests: s.changeRequests });
  };

  it("two qualifying replies to one notice: two messages, one change request, merchant attention, nothing else changes", async () => {
    const notice = await toNotice();
    await svc.buyerReply({ inReplyTo: notice.id, scriptId: "notice-cash-tight" });
    const before = await material();
    const s = await svc.buyerReply({ inReplyTo: notice.id, text: "Sorry, cash is tight till the 25th." });
    const replies = s.conversation.filter((i) => i.inReplyTo === notice.id);
    expect(replies.map((r) => [r.text, r.classification!.kind])).toEqual([
      ["Cash is tight till the 20th.", "change_requested"],
      ["Sorry, cash is tight till the 25th.", "change_requested"],
    ]);
    expect(s.changeRequests).toHaveLength(1);
    expect(s.changeRequests[0]).toMatchObject({ replyId: replies[0].id, unavailableUntil: "2026-12-20", earliestDebit: "2026-12-21", state: "change_requested" }); // first date kept
    expect(await material()).toBe(before);
    expect(s.events.at(-1)).toMatchObject({ kind: "merchant_attention", title: "Merchant attention needed: a change request is already open" });
    expect(s.events.at(-1)!.detail).toMatch(/chg-1 is already open.*did not replace the requested date/);
    await svc.reviewWork("message", replies[1].id, "keep_current_terms", "Use the first requested date");
  });

  it("a further reply while the draft awaits approvals is also refused; the hero flow then completes unchanged", async () => {
    const notice = (await S()).conversation.find((x) => x.kind === "notice")!;
    let s = await svc.proposeAmendment();
    expect(s.changeRequests[0].state).toBe("draft_amendment");
    const before = await material();
    s = await svc.buyerReply({ inReplyTo: notice.id, text: "Make it till the 22nd" });
    const lateCorrection = s.conversation.at(-1)!;
    expect(s.conversation.filter((i) => i.inReplyTo === notice.id)).toHaveLength(3);
    expect(await material()).toBe(before);
    expect(s.events.at(-1)!.title).toBe("Merchant attention needed: a change request is already open");

    const v2 = s.agreements.find((v) => v.version === 2)!;
    await expect(svc.approveAmendment(v2.termsHash)).rejects.toThrow(/buyer request/i);
    await svc.reviewWork("message", lateCorrection.id, "keep_current_terms", "Use the already drafted date");
    await driveTo(svc, (x) => x.amendments[0]?.state === "active");
    s = await S();
    expect(s.changeRequests).toHaveLength(1);
    expect(s.changeRequests[0].history.map((h) => h.state)).toEqual(["change_requested", "draft_amendment", "payment_rescheduled"]);
    expect(s.amendments).toHaveLength(1);
    expect(s.amendments[0]).toMatchObject({ trigger: "buyer_message", state: "active", change: { lineId: "pay-2", fromDueDate: "2026-12-01", toDueDate: "2026-12-21" } });
    expect(s.attempts.filter((a) => a.scheduleLineId === "pay-2" && a.status === "scheduled").map((a) => [a.dueDate, a.agreementVersion])).toEqual([["2026-12-21", 2]]);
  });

  it("a stale earlier-version request never blocks a valid request for the active version", async () => {
    // A stale version-1 request for the same line, as a store saved before this guard could hold.
    // Dynamic import: the store reads ADAPTIVE_DEALS_DATA_DIR when first loaded (see test-isolation.test.ts).
    const { readJson, writeJsonAtomic } = await import("@/lib/store");
    const raw = (await readJson<Awaited<ReturnType<Svc["getState"]>>>(svc.STORE_FILE))!;
    const done = raw.changeRequests[0];
    raw.changeRequests.unshift({ ...done, id: "chg-stale", state: "change_requested", amendmentId: null, agreementVersion: 1, history: [done.history[0]] });
    await writeJsonAtomic(svc.STORE_FILE, raw);
    // Updated: actionability is asserted through dealProgress, not the guided demo step (plan Task 6).
    expect((await svc.progressOf(await S())).primaryAction?.id).not.toBe("draft_revised_terms"); // the stale request is not actionable

    let s = await svc.simulate("advance_notice");
    const notice = s.conversation.filter((i) => i.kind === "notice").at(-1)!;
    expect(s.attempts.find((a) => a.id === notice.refs.attemptId)).toMatchObject({ scheduleLineId: "pay-2", agreementVersion: 2, dueDate: "2026-12-21" });
    expect(localDateOf(notice.sentAt!, "Asia/Kolkata")).toBe("2026-12-18");
    s = await svc.buyerReply({ inReplyTo: notice.id, text: "Cash is tight till the 24th." });
    const fresh = s.changeRequests.find((c) => c.agreementVersion === 2)!;
    expect(fresh).toMatchObject({ scheduleLineId: "pay-2", state: "change_requested", unavailableUntil: "2026-12-24", earliestDebit: "2026-12-25" });
    expect(s.events.at(-1)!.title).toBe("Change requested");
    expect((await svc.progressOf(s)).primaryAction?.id).toBe("draft_revised_terms");

    s = await svc.proposeAmendment();
    expect(s.amendments).toHaveLength(2);
    expect(s.amendments[1]).toMatchObject({ fromVersion: 2, change: { lineId: "pay-2", fromDueDate: "2026-12-21", toDueDate: "2026-12-25" } });
    expect(s.changeRequests.find((c) => c.id === fresh.id)!.state).not.toBe("change_requested"); // the active-version request was acted on
    expect(s.changeRequests.find((c) => c.id === "chg-stale")).toMatchObject({ state: "change_requested", amendmentId: null }); // stale one untouched
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("decline", () => {
  it("records buyer rejection and creates no payment setup", async () => {
    await svc.resetToSeed();
    await driveTo(svc, (x) => x.status === "sent");
    const s = await svc.declineAgreement(1);
    expect(s.status).toBe("buyer_rejected");
    expect(s.agreements[0]).toMatchObject({ status: "buyer_rejected", buyerAcceptance: null });
    expect(s.agreements[0].buyerDecline).toBeDefined();
    expect([s.paymentLinks, s.attempts, s.mandate]).toEqual([[], [], null]);
    await expect(svc.acceptAgreement(1, s.agreements[0].termsHash, true)).rejects.toThrow();
  });
});
