import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ConversationItem } from "@/domain/conversation";
import { activeVersionOf, NO_REQUEST_NEUTRAL, noticeReplyOutcome } from "@/lib/views";
import { driveTo } from "../helpers/drive";

/**
 * The status shown for a buyer's reply to an advance notice must be what actually happened:
 * "Change requested" only when a request was created; otherwise merchant attention with the
 * reason recorded at the time (or neutral wording). No model or network call is allowed.
 */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-outcomes-"));
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic"; // pinned to the labelled hand-written sample: this suite asserts that run

type Svc = typeof import("@/lib/service");
type State = Awaited<ReturnType<Svc["getState"]>>;
let svc: Svc;
const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
  throw new Error("No network call is allowed");
});
beforeAll(async () => {
  svc = await import("@/lib/service");
});
afterAll(() => fetchSpy.mockRestore());

const payment = (s: State) => JSON.stringify({ attempts: s.attempts, paymentLinks: s.paymentLinks, agreements: s.agreements, mandate: s.mandate, amendments: s.amendments, notices: s.notices, changeRequests: s.changeRequests, status: s.status });
const outcomeOf = (s: State, reply: ConversationItem) => noticeReplyOutcome(reply, s, activeVersionOf(s.agreements)?.version ?? null)!;
async function toFirstNotice() {
  await svc.resetToSeed();
  await driveTo(svc, (s) => s.conversation.some((x) => x.kind === "notice"));
  return (await svc.getState()).conversation.find((x) => x.kind === "notice")!;
}

describe("truthful outcome of a date reply to a notice", () => {
  it("a created request shows Change requested; a duplicate shows the recorded reason, not a second request", async () => {
    const notice = await toFirstNotice();
    let s = await svc.buyerReply({ inReplyTo: notice.id, scriptId: "notice-cash-tight" });
    const first = s.conversation.at(-1)!;
    expect(outcomeOf(s, first)).toMatchObject({ label: "Change requested", changeRequestId: "chg-1" });

    const before = payment(s);
    s = await svc.buyerReply({ inReplyTo: notice.id, text: "Actually till the 25th" });
    const dup = s.conversation.at(-1)!;
    expect(dup.classification?.kind).toBe("change_requested");
    const o = outcomeOf(s, dup);
    expect(o.label).toBe("Merchant attention needed");
    expect(o.changeRequestId).toBeNull();
    expect(o.detail).toMatch(/Change request chg-1 is already open/);
    expect(payment(s)).toBe(before);
    expect((await svc.progressOf(s)).rule).toBe("track.conflicting_evidence");
    const reviewed = await svc.reviewWork("message", dup.id, "follow_up_pending", "Waiting for the buyer's corrected date");
    expect((await svc.progressFacts(reviewed)).workItems).toContainEqual(expect.objectContaining({ kind: "follow_up_pending", note: "Waiting for the buyer's corrected date" }));
    expect((await svc.progressOf(reviewed)).rule).toBe("track.change_request");
    const resolved = await svc.reviewWork("message", dup.id, "handled_outside", "Resolved on a call");
    expect((await svc.progressOf(resolved)).rule).toBe("track.change_request");
  });

  it("an acknowledgement creates no work item", async () => {
    const notice = await toFirstNotice();
    const s = await svc.buyerReply({ inReplyTo: notice.id, text: "Okay" });
    expect((await svc.progressFacts(s)).workItems).toEqual([]);
  });

  it("a reply to a notice whose payment was removed after rescheduling: attention, with the recorded reason", async () => {
    await driveTo(svc, (s) => s.amendments.at(-1)?.state === "active");
    let s = await svc.getState();
    const oldNotice = s.conversation.find((x) => x.kind === "notice")!;
    expect(s.attempts.find((a) => a.id === oldNotice.refs.attemptId)!.status).toBe("removed");
    const before = payment(s);
    s = await svc.buyerReply({ inReplyTo: oldNotice.id, text: "Cash is tight till the 25th." });
    const reply = s.conversation.at(-1)!;
    expect(reply.classification?.kind).toBe("change_requested");
    const o = outcomeOf(s, reply);
    expect(o).toMatchObject({ label: "Merchant attention needed", changeRequestId: null });
    expect(o.detail).toMatch(/attempt is removed; nothing to reschedule/);
    expect(o.detail).not.toMatch(/already open/);
    expect(payment(s)).toBe(before);
  });

  it("a reply after the payment succeeded: attention, with the recorded reason; nothing is charged or moved", async () => {
    const notice = await toFirstNotice();
    await svc.simulate("debit_succeeded");
    let s = await svc.getState();
    expect(s.attempts.find((a) => a.id === notice.refs.attemptId)!.status).toBe("succeeded");
    const before = payment(s);
    s = await svc.buyerReply({ inReplyTo: notice.id, text: "Cash is tight till the 20th." });
    const reply = s.conversation.at(-1)!;
    expect(reply.classification?.kind).toBe("change_requested");
    const o = outcomeOf(s, reply);
    expect(o).toMatchObject({ label: "Merchant attention needed", changeRequestId: null });
    expect(o.detail).toMatch(/already succeeded; it cannot be rescheduled/);
    expect(o.detail).not.toMatch(/already open/);
    expect(payment(s)).toBe(before);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("the recorded reason is used only when it links to the reply reliably", () => {
  const reply = {
    id: "r1",
    text: "till the 20th",
    createdAt: "2026-11-28T12:30:00+05:30",
    inReplyTo: "n1",
    classification: { kind: "change_requested" as const, phrase: "till the 20th", unavailableUntil: "2026-12-20", earliestDebit: "2026-12-21", replyDate: "2026-11-28", transformation: "" },
  };
  const own = { kind: "buyer_message", title: "Buyer: “till the 20th”", detail: "Typed simulated reply · reply to notice n1 · Change requested", at: reply.createdAt };
  const refusal = { kind: "merchant_attention", title: "Merchant attention needed", detail: "Recorded reason", at: reply.createdAt };

  it("uses the refusal recorded immediately after the reply's own event", () => {
    expect(noticeReplyOutcome(reply, { changeRequests: [], events: [own, refusal] }, 1)!.detail).toBe("Recorded reason");
  });
  it("falls back to neutral wording when the link is ambiguous or missing", () => {
    expect(noticeReplyOutcome(reply, { changeRequests: [], events: [own, refusal, own, refusal] }, 1)!.detail).toBe(NO_REQUEST_NEUTRAL);
    expect(noticeReplyOutcome(reply, { changeRequests: [], events: [own] }, 1)!.detail).toBe(NO_REQUEST_NEUTRAL);
    expect(noticeReplyOutcome(reply, { changeRequests: [], events: [refusal] }, 1)!.detail).toBe(NO_REQUEST_NEUTRAL);
  });
  it("never shows Change requested without a request", () => {
    expect(noticeReplyOutcome(reply, { changeRequests: [], events: [] }, 1)!.label).toBe("Merchant attention needed");
  });
});
