import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { replyContext } from "@/lib/demo-steps";
import { headlineFor } from "@/lib/offer-copy";

/**
 * Case A, Lotus Row Interiors: a buyer holds a rival's quote of ₹80,000 for the year. The product does not match it (that would take
 * 44% off, with no discount allowed and a profit far under the floor); it offers the longest commitment of the same four services
 * that fits the cap, paid by one UPI link.
 */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-case-a-"));
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic";
type Svc = typeof import("@/lib/service");
let svc: Svc;
const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("no network"); });
beforeAll(async () => { svc = await import("@/lib/service"); });
afterAll(() => fetchSpy.mockRestore());

const FIVE = "shorter_commitment:term_months=5,plan=upfront";
async function answered() {
  await svc.startCase("no-fit");
  await svc.sendQuestions();
  const s = await svc.getState();
  const q = s.conversation.find((i) => i.kind === "clarification" && i.refs.questionId === "clar-gst")!;
  await svc.buyerReply({ inReplyTo: q.id, scriptId: "clar-gst-yes" });
  await svc.adoptRepliesAsAnswers();
  const after = await svc.getState();
  // The answer is the one the recorded sample was made with, so nothing is worked out again.
  expect(after.decisionBranch).toBeNull();
  return after;
}
const codes = (x: { buyerChecks: { status: string; code: string }[]; sellerChecks: { status: string; code: string }[] }) => [...x.buyerChecks, ...x.sellerChecks].filter((c) => c.status === "fail").map((c) => c.code);

describe("the question and the buyer's simulated answers", () => {
  it("asks only whether the ₹80,000 includes GST", async () => {
    await svc.startCase("no-fit");
    const s = await svc.sendQuestions();
    expect(s.conversation.filter((i) => i.kind === "clarification").map((i) => i.refs.questionId)).toEqual(["clar-gst"]);
  });

  it("offers the guide only the answers that keep the deal as the chat describes it, in the buyer's own words", async () => {
    await svc.startCase("no-fit");
    await svc.sendQuestions();
    const ctx = replyContext(await svc.getState())!;
    expect(ctx.scripts.map((x) => x.id)).toEqual(["clar-gst-yes", "clar-gst-unclear"]);
    expect(ctx.scripts[0].text).toBe("Sandeep: Yes, ₹80,000 includes GST. It is our all-in number.");
    expect(ctx.scripts[1].text).toContain("not sure whether the ₹80,000 includes GST");
  });
});

describe("what the engine does with the rival's price", () => {
  it("recommends the longest commitment that fits: five months of the same four services, ₹75,520, paid in one go", async () => {
    const s = await answered();
    expect(s.status).toBe("options_ready");
    const view = svc.strategyViewOf(s, await svc.currentOutcome(s));
    expect(view.mode).toBe("standard");
    expect(view.leader?.structure.id).toBe(FIVE);
    expect(view.ranked.map((x) => x.structure.id)).toEqual([FIVE, "shorter_commitment:term_months=3,plan=upfront"]);
    expect(view.leader!.structure.scope.map((i) => [i.packageId, i.months])).toEqual([["website-fixes", 1], ["search-marketing", 5], ["social-media", 5], ["monthly-reporting", 5]]);
    expect(view.leader!.structure.payments.map((p) => [p.dueDate, p.totalPaise])).toEqual([["2026-11-01", 7_552_000]]);
    expect(view.leader!.approval).toBe("within_limit");
    expect(headlineFor(view.leader!)).toBe("Offer a five-month commitment · paid upfront");
  });

  it("refuses to match ₹80,000 for the year, and names why; refuses the year and six months for the budget", async () => {
    const s = await answered();
    const result = (await svc.currentOutcome(s)).evaluation.result!;
    const by = (id: string) => result.structures.find((x) => x.structure.id === id)!;
    // 44% off the year is what ₹80,000 would take: Pinecone allows no discount, and it would keep 13% against its 35% floor.
    const match = by("split_payment:plan=upfront,discount_bps=4400");
    expect(codes(match)).toEqual(expect.arrayContaining(["DISCOUNT_ABOVE_LIMIT", "CONTRIBUTION_BELOW_FLOOR"]));
    expect(Math.round(match.economics.netContributionBps / 100)).toBe(13);
    expect(codes(by("split_payment:plan=upfront"))).toContain("BUDGET_EXCEEDS_CURRENT_PERIOD");
    expect(codes(by("shorter_commitment:term_months=6,plan=upfront"))).toContain("BUDGET_EXCEEDS_CURRENT_PERIOD");
    // No discount is applied to a short commitment: only the year is ever priced at the level that would match.
    expect(result.structures.some((x) => x.structure.template === "shorter_commitment" && x.structure.discountBps > 0)).toBe(false);
  });
});

describe("the deal after the owner sends it", () => {
  it("is one payment link on 1 Nov, with no mandate and no held rest of the year, and ends when it is paid", async () => {
    const s0 = await answered();
    expect(svc.strategyViewOf(s0, await svc.currentOutcome(s0)).leader!.structure.id).toBe(FIVE);
    const d = await svc.reviewBuyerProposal();
    expect(d.terms.pricing).toMatchObject({ totalPaise: 7_552_000, discountBps: 0 });
    expect(d.terms.paymentSchedule.map((p) => [p.dueDate.value, p.method])).toEqual([["2026-11-01", "payment_link"]]);
    expect(d.terms.mandate).toBeNull();
    expect(d.terms.followOn).toBeUndefined();
    await svc.approveDraft(d.version, d.termsHash);
    await svc.sendProposal(d.version);
    const sent = (await svc.getState()).agreements.find((a) => a.status === "sent")!;
    await svc.acceptAgreement(sent.version, sent.termsHash, false);
    await svc.simulate("payment_link_paid");
    expect((await svc.progressOf(await svc.getState())).rule).toBe("track.fully_paid");
  });
});

describe("a change the buyer asks for on the sent proposal", () => {
  async function sent() {
    await answered();
    const d = await svc.reviewBuyerProposal();
    await svc.approveDraft(d.version, d.termsHash);
    await svc.sendProposal(d.version);
    return (await svc.getState()).agreements.find((a) => a.status === "sent")!;
  }

  it("is checked by the engine: ₹70,000 is not reachable without breaking the owner's own rules, and the answer is named", async () => {
    const v = await sent();
    await svc.requestChange(v.version, "", "price", { kind: "price", targetPaise: 7_000_000, gstBasis: "including" });
    const check = await svc.checkCounterOffer(7_000_000);
    expect(check.totalPaise).toBeLessThan(7_552_000);
    expect(check.passes).toBe(false);
    expect(check.failing.map((f) => f.id)).toContain("discount_limit");
  });

  it("is answered by holding firm: the offer stays as sent", async () => {
    const v = await sent();
    await svc.requestChange(v.version, "", "price", { kind: "price", targetPaise: 7_000_000, gstBasis: "including" });
    expect((await svc.progressOf(await svc.getState())).rule).toBe("track.buyer_request");
    const request = (await svc.getState()).conversation.findLast((m) => m.kind === "change_request")!;
    await svc.reviewWork("message", request.id, "keep_current_terms");
    const after = await svc.getState();
    expect(after.agreements.find((a) => a.version === v.version)!.status).toBe("sent");
    expect((await svc.progressOf(after)).rule).toBe("track.sent_awaiting_buyer");
  });
});
