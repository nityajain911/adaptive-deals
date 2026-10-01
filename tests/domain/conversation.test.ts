import { describe, expect, it } from "vitest";
import { buildCanonicalTerms } from "@/domain/agreement";
import { scheduleAttempt, transitionAttempt, type CollectionAttempt } from "@/domain/collections";
import {
  assertBuyerSafe,
  codeMessage,
  ConversationError,
  draftClarification,
  merchantSend,
  noticeMessageText,
  proposalMessageText,
  receiveBuyerReply,
  type ConversationItem,
} from "@/domain/conversation";
import { interpretations } from "@/domain/constraints";
import { enumerateAndEvaluate } from "@/domain/engine";
import { formatDate } from "@/domain/dates";
import { formatINR } from "@/domain/money";
import { planAdvanceNotice, type AdvanceNotice } from "@/domain/notices";
import { createChangeRequest, RestructureError } from "@/domain/restructure";
import { heroMerchant } from "@/data/synthetic/hero";
import { clarifiedHeroProfile, heroInput } from "../helpers";

const TZ = "Asia/Kolkata";
const T0 = "2026-11-28T10:00:00+05:30";
const base = { dealId: "d" };

function noticeThread() {
  const attempt = scheduleAttempt([], { agreementId: "agr", agreementVersion: 1, scheduleLineId: "pay-2", dueDate: "2026-12-01", amountPaise: 2_301_000, prePaise: 1_950_000, gstPaise: 351_000, origin: "agreement", method: "recurring_debit" }, 4_602_000, "2026-10-01T09:00:00+05:30");
  const notice: AdvanceNotice = { ...planAdvanceNotice(attempt, heroMerchant.policy), sentAt: T0 };
  const item = codeMessage({ ...base, id: "n1", kind: "notice", text: noticeMessageText(notice), at: T0, refs: { noticeId: notice.id, attemptId: attempt.id } });
  return { attempt, notice, item };
}
const reply = (conv: ConversationItem[], text: string, atTs = "2026-11-28T12:30:00+05:30", to = "n1") => receiveBuyerReply({ ...base, id: "r1", text, at: atTs, inReplyTo: to, conversation: conv, timeZone: TZ, scripted: true });

describe("conversation items", () => {
  it("AI drafts are suggestions until the merchant sends them; none are created while paused", () => {
    const d = draftClarification({ ...base, id: "c1", questionId: "clar-gst", text: "Do both ₹50,000 and ₹60,000 include GST?", wording: "ai", at: T0, paused: false })!;
    expect(d).toMatchObject({ state: "suggested_by_ai", author: "ai", sentAt: null });
    expect(merchantSend(d, T0)).toMatchObject({ state: "approved_and_sent_by_merchant", sentAt: T0 });
    expect(draftClarification({ ...base, id: "c2", questionId: "clar-gst", text: "x?", wording: "ai", at: T0, paused: true })).toBeNull();
    expect(draftClarification({ ...base, id: "c3", questionId: "clar-gst", text: "x?", wording: "code_fallback", at: T0, paused: false })).toMatchObject({ state: "drafted_by_code", author: "code" });
  });

  it("a reply must answer a sent message and cannot predate it", () => {
    const { item } = noticeThread();
    const draft = draftClarification({ ...base, id: "c1", questionId: "q", text: "x?", wording: "ai", at: T0, paused: false })!;
    expect(() => reply([item, draft], "ok", "2026-11-28T12:30:00+05:30", "c1")).toThrow(/sent/);
    expect(() => reply([item], "ok", "2026-11-28T09:00:00+05:30")).toThrow(/predate/);
    expect(() => reply([item], "ok", "2026-11-28T12:30:00+05:30", "nope")).toThrow(ConversationError);
    expect(reply([item], "Cash is tight till the 20th.")).toMatchObject({ state: "received_from_buyer", author: "buyer", inReplyTo: "n1", provenance: "simulated", classification: { kind: "change_requested" } });
  });
});

describe("buyer-facing text", () => {
  it("rejects internal economics, policy and rejection wording", () => {
    for (const t of ["Your net contribution is fine", "within our cash-at-risk limit", "above our floor", "peak funding", "this was rejected by policy"]) expect(() => assertBuyerSafe(t)).toThrow(ConversationError);
    expect(() => codeMessage({ ...base, id: "x", kind: "proposal", text: "Our margin is 50%", at: T0 })).toThrow(/internal wording/);
  });

  it("proposal and notice messages carry only canonical figures", () => {
    const r = enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput());
    const x = r.feasible[0];
    const terms = buildCanonicalTerms({ dealId: "d", merchantId: "m", buyerId: "b", structure: x.structure, gstRateBps: 1800, mandate: null });
    const text = proposalMessageText(terms, 1, "/proposal/agr-hero/v1");
    expect(text).toContain(formatINR(terms.pricing.totalPaise));
    for (const p of terms.paymentSchedule) expect(text).toContain(`${formatINR(p.totalPaise)} on ${formatDate(p.dueDate.value)}`);
    expect(text).not.toContain(formatINR(x.economics.netContributionPaise));
    expect(() => assertBuyerSafe(text)).not.toThrow();
    expect(() => assertBuyerSafe(noticeMessageText(noticeThread().notice))).not.toThrow();
  });
});

describe("change requests select the collection line through the notice", () => {
  it("reply → notice → attempt → schedule line", () => {
    const { attempt, notice, item } = noticeThread();
    const r = reply([item], "Cash is tight till the 20th.");
    const cr = createChangeRequest({ id: "chg-1", reply: r, conversation: [item, r], notices: [notice], attempts: [attempt], activeVersion: 1 });
    expect(cr).toMatchObject({ noticeId: notice.id, attemptId: attempt.id, scheduleLineId: "pay-2", unavailableUntil: "2026-12-20", earliestDebit: "2026-12-21", timing: "preventive", state: "change_requested" });
  });

  it("refuses non-change replies, replies to non-notices, pending outcomes and paid lines", () => {
    const { attempt, notice, item } = noticeThread();
    const ok = reply([item], "Okay");
    expect(() => createChangeRequest({ id: "c", reply: ok, conversation: [item, ok], notices: [notice], attempts: [attempt], activeVersion: 1 })).toThrow(RestructureError);

    const proposal = codeMessage({ ...base, id: "p1", kind: "proposal", text: "Proposal", at: T0 });
    const toProposal = reply([proposal], "Cash is tight till the 20th.", "2026-11-28T12:30:00+05:30", "p1");
    expect(() => createChangeRequest({ id: "c", reply: toProposal, conversation: [proposal, toProposal], notices: [notice], attempts: [attempt], activeVersion: 1 })).toThrow(/does not answer an advance notice/);

    const r = reply([item], "Cash is tight till the 20th.");
    const submitted: CollectionAttempt = transitionAttempt(attempt, "submitted", T0, "");
    expect(() => createChangeRequest({ id: "c", reply: r, conversation: [item, r], notices: [notice], attempts: [submitted], activeVersion: 1 })).toThrow(/Awaiting payment outcome/);
    const paid = transitionAttempt(submitted, "succeeded", T0, "");
    expect(() => createChangeRequest({ id: "c", reply: r, conversation: [item, r], notices: [notice], attempts: [paid], activeVersion: 1 })).toThrow(/already succeeded/);
  });
});
