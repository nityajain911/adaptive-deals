import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { replyContext } from "@/lib/demo-steps";

/**
 * Case B, Zephyr Logistics: a discount asked for in exchange for nothing, answered with a smaller one against an advance. The engine
 * refuses the 15% and the net-45 terms by name, offers the one thing that works, and the journey that follows is the preventive one: a
 * balance, a notice, a buyer who needs a few days, and a moved payment.
 */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-case-b-"));
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic";
type Svc = typeof import("@/lib/service");
let svc: Svc;
const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("no network"); });
beforeAll(async () => { svc = await import("@/lib/service"); });
afterAll(() => fetchSpy.mockRestore());

const GST = "clar-gst";
async function answered() {
  await svc.startCase("preserve-scope");
  await svc.sendQuestions();
  const s = await svc.getState();
  const q = s.conversation.find((i) => i.kind === "clarification" && i.refs.questionId === GST)!;
  await svc.buyerReply({ inReplyTo: q.id, scriptId: "clar-gst-yes" });
  await svc.adoptRepliesAsAnswers();
  const s2 = await svc.getState();
  // The answer is the one the recorded sample was made with, so nothing is worked out again.
  expect(s2.decisionBranch).toBeNull();
  return s2;
}

describe("the questions and the buyer's simulated answers", () => {
  it("asks only whether the amounts include GST, because the approval scope changes nothing here", async () => {
    await svc.startCase("preserve-scope");
    const s = await svc.sendQuestions();
    expect(s.conversation.filter((i) => i.kind === "clarification").map((i) => i.refs.questionId)).toEqual([GST]);
  });

  it("offers the guide only the answers that keep the deal the chat describes, in the buyer's own words", async () => {
    await svc.startCase("preserve-scope");
    await svc.sendQuestions();
    const ctx = replyContext(await svc.getState())!;
    expect(ctx.scripts.map((x) => x.id)).toEqual(["clar-gst-yes", "clar-gst-unclear"]);
    expect(ctx.scripts[0].text).toBe("Priya: Yes, both amounts include GST. We budget everything with GST.");
    expect(ctx.scripts[1].text).toContain("₹30,000 includes GST");
  });
});

describe("what the engine does with the ask", () => {
  it("recommends no discount of its own: nothing fits at the normal prices, and the one offer that works is the smaller discount with an advance", async () => {
    const s = await answered();
    expect(s.status).toBe("options_ready");
    const out = await svc.currentOutcome(s);
    const view = svc.strategyViewOf(s, out);
    expect(view.mode).toBe("discount_only");
    expect(view.leader).toBeNull();
    expect(view.discounted.map((x) => x.structure.id)).toEqual(["phased_scope:scope=web-search-social-6m,plan=advance_40,discount_bps=1000"]);
    const offer = view.discounted[0];
    expect(offer.structure.payments.map((p) => [p.dueDate, p.totalPaise])).toEqual([["2026-12-01", 2_803_680], ["2027-01-01", 4_205_520]]);
    expect(offer.approval).toBe("within_limit");
    // The discount keeps the merchant's own floor.
    expect(offer.economics.netContributionBps).toBeGreaterThanOrEqual(3500);
  });

  it("refuses the 15%, and the net-45 terms, each by its own rule", async () => {
    const s = await answered();
    const result = (await svc.currentOutcome(s)).evaluation.result!;
    const codes = (id: string) => [...result.structures.find((x) => x.structure.id === id)!.buyerChecks, ...result.structures.find((x) => x.structure.id === id)!.sellerChecks].filter((c) => c.status === "fail").map((c) => c.code);
    expect(codes("phased_scope:scope=web-search-social-6m,plan=advance_40,discount_bps=1500")).toEqual(["DISCOUNT_ABOVE_LIMIT"]);
    expect(codes("phased_scope:scope=web-search-social-6m,plan=net_45,discount_bps=1000")).toContain("CASH_AT_RISK_ABOVE_LIMIT");
    // Without an advance, even the discount the merchant allows does not fit the buyer's ₹30,000.
    expect(codes("phased_scope:scope=web-search-social-6m,plan=upfront,discount_bps=1000")).toEqual(["BUDGET_EXCEEDS_CURRENT_PERIOD"]);
    // The full six months at 10% off is out of the buyer's budget on signing, whatever the approval says.
    expect(codes("split_payment:plan=advance_40,discount_bps=1000")).toContain("BUDGET_EXCEEDS_CURRENT_PERIOD");
  });

  it("does not let the owner send anything until they have chosen the discount themselves", async () => {
    await answered();
    await expect(svc.reviewBuyerProposal()).rejects.toThrow(/Select one of the permitted discounted offers/);
  });
});

describe("the deal after the owner chooses it", () => {
  it("is ₹70,092 including GST, 40% on 1 Dec and the balance on 1 Jan, with no reporting and no held offer", async () => {
    const s = await answered();
    const offer = svc.strategyViewOf(s, await svc.currentOutcome(s)).discounted[0];
    await svc.selectOption(offer.structure.id);
    const draft = await svc.reviewBuyerProposal();
    expect(draft.terms.pricing).toMatchObject({ totalPaise: 7_009_200, discountBps: 1000 });
    expect(draft.terms.scope.map((x) => x.packageId)).toEqual(["website-fixes", "search-marketing", "social-media"]);
    expect(draft.terms.followOn).toBeUndefined();
    expect(draft.terms.paymentSchedule.map((p) => [p.dueDate.value, p.method])).toEqual([["2026-12-01", "payment_link"], ["2027-01-01", "recurring_debit"]]);
    expect(draft.terms.mandate).not.toBeNull();
  });

  it("goes through the preventive journey: a notice, a buyer who asks to hold it till the 12th, and a moved balance", async () => {
    const s0 = await answered();
    await svc.selectOption(svc.strategyViewOf(s0, await svc.currentOutcome(s0)).discounted[0].structure.id);
    const d = await svc.reviewBuyerProposal();
    await svc.approveDraft(d.version, d.termsHash);
    await svc.sendProposal(d.version);
    const sent = (await svc.getState()).agreements.find((a) => a.status === "sent")!;
    await svc.acceptAgreement(sent.version, sent.termsHash, sent.terms.conditions.includes("buyer_confirms_authority_for_phase_scope"));
    await svc.simulate("payment_link_paid");
    await svc.simulate("mandate_confirmed");
    await svc.simulate("advance_notice");
    const notice = (await svc.getState()).conversation.findLast((m) => m.kind === "notice")!;
    expect(notice.createdAt.slice(0, 10)).toBe("2026-12-29");
    expect(replyContext(await svc.getState())!.scripts.find((x) => x.id === "notice-cash-tight")!.text).toBe("Priya: Invoice approval is delayed. Please hold the payment till the 12th.");
    await svc.buyerReply({ inReplyTo: notice.id, scriptId: "notice-cash-tight" });
    const cr = (await svc.getState()).changeRequests.at(-1)!;
    expect(cr).toMatchObject({ state: "change_requested", unavailableUntil: "2027-01-12", earliestDebit: "2027-01-13" });
    await svc.proposeAmendment();
    const draft = (await svc.getState()).agreements.find((a) => a.status === "draft")!;
    await svc.approveAmendment(draft.termsHash);
    const revised = (await svc.getState()).agreements.find((a) => a.status === "sent")!;
    await svc.acceptAmendment(revised.termsHash, revised.terms.conditions.includes("buyer_confirms_authority_for_phase_scope"));
    const final = await svc.getState();
    expect(final.agreements.find((a) => a.status === "active")!.terms.paymentSchedule.map((p) => p.dueDate.value)).toEqual(["2026-12-01", "2027-01-13"]);
    await svc.simulate("debit_succeeded");
    expect((await svc.progressOf(await svc.getState())).rule).toBe("track.fully_paid");
  });
});
