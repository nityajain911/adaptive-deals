import { describe, expect, it } from "vitest";
import { paymentTimeline } from "@/lib/payment-timeline";

const attempt = (id: string, version: number, dueDate: string, status: string, origin = "agreement") => ({ id, agreementId: "agr-hero", agreementVersion: version, scheduleLineId: id.includes("first") ? "pay-1" : "pay-2", dueDate, amountPaise: 2_301_000, prePaise: 1_950_000, gstPaise: 351_000, idempotencyKey: id, status, origin, method: id.includes("first") ? "payment_link" : "recurring_debit", razorpayId: null, history: [{ at: `${dueDate}T10:00:00+05:30`, status, note: status }] });
const version = (number: number, supersedes?: number) => ({ version: number, supersedes, status: "active", buyerAcceptance: { at: number === 1 ? "2026-10-02T10:00:00+05:30" : "2026-11-28T12:00:00+05:30" }, terms: {} });

describe("agreement payment timeline", () => {
  it("tells the preventive hero as paid, reminded, replaced, then scheduled", () => {
    const items = paymentTimeline({
      agreements: [version(1), version(2, 1)] as never,
      attempts: [attempt("first-paid", 1, "2026-11-01", "succeeded"), attempt("second-removed", 1, "2026-12-01", "removed"), attempt("second-new", 2, "2026-12-21", "scheduled", "amendment")] as never,
      notices: [{ id: "notice-1", attemptId: "second-removed", sentAt: "2026-11-28T10:00:00+05:30", amountPaise: 2_301_000, dueDate: "2026-12-01" }] as never,
      deliveries: [{ version: 1, kind: "proposal", deliveredAt: "2026-10-01T12:00:00+05:30", reference: "msg-1" }] as never,
      events: [],
    }, 2);
    expect(items.map((item) => [item.label, item.state])).toEqual(expect.arrayContaining([
      ["Proposal sent to buyer", "completed"],
      ["Payment received · ₹23,010", "completed"],
      ["Payment reminder sent", "completed"],
      ["Payment on 1 Dec 2026 replaced", "replaced"],
      ["Automatic payment · ₹23,010", "current"],
    ]));
    expect(items.map((item) => item.at)).toEqual([...items.map((item) => item.at)].sort());
  });

  it("keeps a failed attempt in history while showing its retry as the current payment", () => {
    const items = paymentTimeline({ agreements: [version(1)] as never, attempts: [attempt("second-failed", 1, "2026-12-01", "failed"), attempt("second-retry", 1, "2026-12-04", "scheduled", "internal_retry")] as never, notices: [], events: [] }, 1);
    expect(items.find((item) => item.id === "failed-second-failed")).toMatchObject({ state: "failed" });
    expect(items.find((item) => item.id === "scheduled-second-retry")).toMatchObject({ state: "current" });
  });

  it("does not call a removed payment scheduled or due", () => {
    const items = paymentTimeline({ agreements: [version(1)] as never, attempts: [attempt("second-removed", 1, "2026-12-01", "removed")] as never, notices: [], events: [] }, 1);
    expect(items).toEqual([expect.objectContaining({ state: "completed" }), expect.objectContaining({ state: "replaced", label: expect.stringContaining("replaced") })]);
    expect(items.map((item) => item.label).join(" ")).not.toMatch(/scheduled|due/i);
  });
});
