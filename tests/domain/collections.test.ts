import { describe, expect, it } from "vitest";
import { CollectionError, scheduleAttempt, scheduleInternalRetry, submitAttempt, transitionAttempt, type CollectionAttempt } from "@/domain/collections";

const AT = "2026-11-01T10:00:00+05:30";
const TOTAL = 2_000;
const line = (id: string, amount = 1_000) => ({ agreementId: "agr", agreementVersion: 1, scheduleLineId: id, dueDate: "2026-11-01", amountPaise: amount, prePaise: amount, gstPaise: 0, origin: "agreement" as const, method: "recurring_debit" as const });
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as CollectionError).code;
  }
  return null;
};

describe("collection attempts", () => {
  it("assign unique idempotency keys", () => {
    const a = scheduleAttempt([], line("pay-1"), TOTAL, AT);
    const b = scheduleAttempt([a], line("pay-2"), TOTAL, AT);
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
    expect(a.idempotencyKey).toBe("ad_agr_v1_pay-1_1");
  });

  it("prevent duplicate scheduled attempts for the same line", () => {
    const a = scheduleAttempt([], line("pay-1"), TOTAL, AT);
    expect(codeOf(() => scheduleAttempt([a], line("pay-1"), TOTAL, AT))).toBe("DUPLICATE_SCHEDULED");
  });

  it("block overlapping collection while an outcome is pending", () => {
    const a = scheduleAttempt([], line("pay-1"), TOTAL, AT);
    const b = scheduleAttempt([a], line("pay-2"), TOTAL, AT);
    const submitted = submitAttempt([a, b], a.id, TOTAL, AT);
    expect(codeOf(() => submitAttempt(submitted, b.id, TOTAL, AT))).toBe("AWAITING_OUTCOME");
    expect(codeOf(() => scheduleAttempt(submitted, line("pay-3"), TOTAL + 1_000, AT))).toBe("AWAITING_OUTCOME");
  });

  it("never charge a line that already succeeded", () => {
    let all: CollectionAttempt[] = [scheduleAttempt([], line("pay-1"), TOTAL, AT)];
    all = submitAttempt(all, all[0].id, TOTAL, AT);
    all = [transitionAttempt(all[0], "succeeded", AT, "paid", "pay_test_1")];
    expect(codeOf(() => scheduleAttempt(all, line("pay-1"), TOTAL, AT))).toBe("LINE_ALREADY_PAID");
  });

  it("block any further charge once the agreement is fully paid", () => {
    let all: CollectionAttempt[] = [scheduleAttempt([], line("pay-1", TOTAL), TOTAL, AT)];
    all = submitAttempt(all, all[0].id, TOTAL, AT);
    all = [transitionAttempt(all[0], "succeeded", AT, "paid")];
    expect(codeOf(() => scheduleAttempt(all, line("pay-2"), TOTAL, AT))).toBe("FULLY_PAID");
  });

  it("only allow valid status transitions", () => {
    const a = scheduleAttempt([], line("pay-1"), TOTAL, AT);
    expect(codeOf(() => transitionAttempt(a, "succeeded", AT, "skip"))).toBe("INVALID_TRANSITION");
    const failed = transitionAttempt(transitionAttempt(a, "submitted", AT, ""), "failed", AT, "");
    expect(codeOf(() => transitionAttempt(failed, "submitted", AT, ""))).toBe("INVALID_TRANSITION");
  });

  it("schedule an internal retry only after a confirmed failure", () => {
    const a = scheduleAttempt([], line("pay-1"), TOTAL, AT);
    expect(() => scheduleInternalRetry([a], a, 3, TOTAL, AT)).toThrow();
    const failed = transitionAttempt(transitionAttempt(a, "submitted", AT, ""), "failed", AT, "");
    const all = scheduleInternalRetry([failed], failed, 3, TOTAL, AT);
    expect(all[1]).toMatchObject({ origin: "internal_retry", dueDate: "2026-11-04", status: "scheduled", idempotencyKey: "ad_agr_v1_pay-1_2" });
  });
});
