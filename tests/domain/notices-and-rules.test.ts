import { describe, expect, it } from "vitest";
import { earliestDebitAfterUnavailableUntil } from "@/domain/amendment";
import { FixedClock } from "@/domain/clock";
import { scheduleAttempt } from "@/domain/collections";
import { interpretations } from "@/domain/constraints";
import { enumerateAndEvaluate, failingChecks, featuredRejections } from "@/domain/engine";
import { planAdvanceNotice, sendAdvanceNotice } from "@/domain/notices";
import { heroMerchant } from "@/data/synthetic/hero";
import { clarifiedHeroProfile, heroInput } from "../helpers";

describe("cash-unavailable-until rule", () => {
  it("day precision: the next day", () => {
    expect(earliestDebitAfterUnavailableUntil({ value: "2026-12-20", precision: "day" })).toBe("2026-12-21");
    expect(earliestDebitAfterUnavailableUntil({ value: "2026-12-31", precision: "day" })).toBe("2027-01-01");
  });
  it("month precision: the first day of the next month", () => {
    expect(earliestDebitAfterUnavailableUntil({ value: "2027-01", precision: "month" })).toBe("2027-02-01");
  });
});

describe("advance notices", () => {
  const attempt = scheduleAttempt([], { agreementId: "a", agreementVersion: 1, scheduleLineId: "pay-2", dueDate: "2026-12-01", amountPaise: 100, prePaise: 100, gstPaise: 0, origin: "agreement", method: "recurring_debit" }, 1_000, "2026-10-01T09:00:00+05:30");
  it("are planned for recurring debits only, a configured number of days ahead", () => {
    expect(planAdvanceNotice(attempt, heroMerchant.policy).sendOn).toBe("2026-11-28");
    expect(() => planAdvanceNotice({ ...attempt, method: "payment_link" }, heroMerchant.policy)).toThrow();
  });
  it("cannot be sent on or after the debit date", () => {
    const n = planAdvanceNotice(attempt, heroMerchant.policy);
    expect(() => sendAdvanceNotice(n, new FixedClock("2026-12-01T08:00:00+05:30"), "Asia/Kolkata")).toThrow(/before the debit/);
  });
});

describe("featured rejection is chosen by rule, not by structure ID", () => {
  const r = enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput());
  const maxPay = (x: (typeof r.rejected)[number]) => Math.max(...x.structure.payments.map((p) => p.totalPaise));

  it("is independent of enumeration order", () => {
    const shuffled = { ...r, rejected: [...r.rejected].reverse() };
    expect(featuredRejections(shuffled).buyer!.structure.id).toBe(featuredRejections(r).buyer!.structure.id);
    expect(featuredRejections(shuffled).seller!.structure.id).toBe(featuredRejections(r).seller!.structure.id);
  });

  it("buyer pick satisfies the rule against every other candidate", () => {
    const pick = featuredRejections(r).buyer!;
    const candidates = r.rejected.filter((x) => x.structure.scopeKind === "full" && failingChecks(x).every((c) => c.side === "buyer"));
    for (const x of candidates) {
      const better =
        failingChecks(x).length < failingChecks(pick).length ||
        (failingChecks(x).length === failingChecks(pick).length && maxPay(x) < maxPay(pick)) ||
        (failingChecks(x).length === failingChecks(pick).length && maxPay(x) === maxPay(pick) && x.structure.startDate < pick.structure.startDate);
      expect(better).toBe(false);
    }
  });

  it("changes when the fixture changes, following the same rule", () => {
    const i = heroInput();
    i.templates.split_payment.plans = i.templates.split_payment.plans.filter((p) => p.id !== "monthly_12");
    const r2 = enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, i);
    const pick = featuredRejections(r2).buyer!;
    expect(pick.structure.id).not.toBe(featuredRejections(r).buyer!.structure.id);
    expect(failingChecks(pick).map((c) => c.code)).toContain("PAYMENT_BEFORE_NEXT_BUDGET");
  });
});
