import { describe, expect, it } from "vitest";
import type { CollectionAttempt } from "@/domain/collections";
import { collectionTruth, scheduleRows } from "@/lib/track-copy";

/** Spec §6.1: amendment copy and payment rows reflect the real collection state, never a fixed sentence. */
const att = (id: string, line: string, due: string, status: CollectionAttempt["status"], over: Partial<CollectionAttempt> = {}): CollectionAttempt => ({
  id,
  agreementId: "agr-hero",
  agreementVersion: 1,
  scheduleLineId: line,
  dueDate: due,
  amountPaise: 2_301_000,
  prePaise: 1_950_000,
  gstPaise: 351_000,
  idempotencyKey: `k-${id}`,
  status,
  origin: "agreement",
  method: line === "pay-1" ? "payment_link" : "recurring_debit",
  razorpayId: null,
  history: [],
  ...over,
});
const amendment = { fromVersion: 1, toVersion: 2, state: "proposed", change: { lineId: "pay-2", fromDueDate: "2026-12-01", toDueDate: "2026-12-21" } } as never;
const terms = (pay2: string) => ({
  paymentSchedule: [
    { id: "pay-1", dueDate: { value: "2026-11-01" }, method: "payment_link", totalPaise: 2_301_000 },
    { id: "pay-2", dueDate: { value: pay2 }, method: "recurring_debit", totalPaise: 2_301_000 },
  ],
});
const v1 = { version: 1, status: "active", terms: terms("2026-12-01") };
const v2 = { version: 2, status: "active", supersedes: 1, terms: terms("2026-12-21") };

describe("collection truth for an amendment", () => {
  it("original debit still scheduled (preventive)", () => {
    const s = { attempts: [att("a1", "pay-1", "2026-11-01", "succeeded"), att("a2", "pay-2", "2026-12-01", "scheduled")], agreements: [v1] } as never;
    expect(collectionTruth(s, amendment)).toEqual([
      "No revised payment date becomes active until both you and the buyer approve.",
      "Original 1 Dec 2026 debit: still scheduled.",
      "Revised date 21 Dec 2026: pending approval.",
    ]);
  });
  it("original debit failed with an internal retry scheduled", () => {
    const s = { attempts: [att("a2", "pay-2", "2026-12-01", "failed"), att("r1", "pay-2", "2026-12-04", "scheduled", { origin: "internal_retry" })], agreements: [v1] } as never;
    const lines = collectionTruth(s, amendment);
    expect(lines).toContain("Original 1 Dec 2026 debit: failed.");
    expect(lines).toContain("Internal retry scheduled for 4 Dec 2026.");
    expect(lines.join(" ")).not.toMatch(/still scheduled|retry removed/);
  });
  it("retry removed only when the domain removed it", () => {
    const s = { attempts: [att("a2", "pay-2", "2026-12-01", "failed"), att("r1", "pay-2", "2026-12-04", "removed", { origin: "internal_retry" }), att("n1", "pay-2", "2026-12-21", "scheduled", { origin: "amendment", agreementVersion: 2 })], agreements: [{ ...v1, status: "superseded" }, v2] } as never;
    const lines = collectionTruth(s, { ...(amendment as object), state: "active" } as never);
    expect(lines).toContain("Internal retry removed.");
    expect(lines).toContain("Revised date 21 Dec 2026: scheduled.");
    expect(lines.join(" ")).not.toMatch(/until both you and the buyer approve/);
  });
});

describe("payment schedule rows", () => {
  it("a failed line with an active retry shows the retry as its status", () => {
    const s = { attempts: [att("a1", "pay-1", "2026-11-01", "succeeded"), att("a2", "pay-2", "2026-12-01", "failed"), att("r1", "pay-2", "2026-12-04", "scheduled", { origin: "internal_retry" })], agreements: [v1] } as never;
    expect(scheduleRows(s, 1).map((r) => [r.lineId, r.status])).toEqual([
      ["pay-1", "Paid"],
      ["pay-2", "Retry scheduled for 4 Dec 2026"],
    ]);
  });
  it("a rescheduled line shows its new date and the date it replaced", () => {
    const s = { attempts: [att("a1", "pay-1", "2026-11-01", "succeeded"), att("a2", "pay-2", "2026-12-01", "removed"), att("n1", "pay-2", "2026-12-21", "scheduled", { origin: "amendment", agreementVersion: 2 })], agreements: [{ ...v1, status: "superseded" }, v2] } as never;
    expect(scheduleRows(s, 2).find((r) => r.lineId === "pay-2")).toMatchObject({ date: "21 Dec 2026", was: "1 Dec 2026", status: "Scheduled" });
  });
});
