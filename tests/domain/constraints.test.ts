import { describe, expect, it } from "vitest";
import { applyClarificationAnswer, interpretations, missingRequiredFields } from "@/domain/constraints";
import { HERO_BUYER_MESSAGE, heroClarificationAnswers } from "@/data/synthetic/hero";
import { extraction, field, msg, profileFrom } from "../helpers";

describe("evidence-backed constraint profile", () => {
  it("builds the hero profile with verified evidence offsets", () => {
    const p = profileFrom();
    expect(p.budgetNow.status).toBe("stated");
    expect(p.budgetNow.value).toEqual({ amountPaise: 5_000_000, period: { start: "2026-10-01", end: "2026-12-31" } });
    for (const e of p.budgetNow.evidence) expect(HERO_BUYER_MESSAGE.slice(e.start, e.end)).toBe(e.quote);
    expect(p.nextBudget.value?.available).toEqual({ value: "2027-04", precision: "month" });
    expect(p.approvalLimit.value).toEqual({ amountPaise: 6_000_000 });
    expect(p.rejectedFields).toEqual([]);
  });

  it("flags GST inclusion and approval scope as ambiguous", () => {
    const p = profileFrom();
    expect(p.amountsIncludeGst.status).toBe("ambiguous");
    expect(p.approvalScope.status).toBe("ambiguous");
    expect(interpretations(p)).toHaveLength(4);
  });

  it("rejects a field whose quote is not in the cited message", () => {
    const m = msg("Only ₹50K left this quarter");
    const p = profileFrom(extraction([field("budget_now_amount", "₹80K", "Only ₹80K left this quarter"), field("budget_now_period", "this quarter", "Only ₹50K left this quarter")]), [m]);
    expect(p.budgetNow.status).toBe("missing");
    expect(p.rejectedFields[0]).toMatchObject({ key: "budget_now_amount", reason: expect.stringContaining("not found verbatim") });
  });

  it("rejects a value that is not inside its own evidence quote", () => {
    const m = msg("Only ₹50K left this quarter");
    const p = profileFrom(extraction([field("budget_now_amount", "₹80K", "Only ₹50K left")]), [m]);
    expect(p.rejectedFields[0].reason).toContain("not contained");
  });

  it("rejects unsupported fields and values that cannot be normalised", () => {
    const m = msg("Budget is a lot this quarter. Pay in bitcoin.");
    const p = profileFrom(extraction([field("payment_currency", "bitcoin", "Pay in bitcoin"), field("budget_now_amount", "a lot", "Budget is a lot this quarter"), field("budget_now_period", "this quarter", "Budget is a lot this quarter")]), [m]);
    expect(p.rejectedFields.map((r) => r.reason)).toEqual(["unsupported field", expect.stringContaining("cannot be safely normalised")]);
    expect(p.budgetNow.status).toBe("missing");
    expect(missingRequiredFields(p)).toEqual(["budgetNow"]);
  });

  it("cites a message that does not exist → rejected", () => {
    const p = profileFrom(extraction([field("approval_limit_amount", "₹60K", "above ₹60K", "nope")]), [msg("above ₹60K")]);
    expect(p.rejectedFields[0].reason).toContain("not found");
  });
});

describe("budget-gap rule", () => {
  it("derives a gap from the end of the current quarter to the next budget month, citing both statements", () => {
    const gap = profileFrom().derivedBudgetGap!;
    expect(gap.from).toBe("2027-01-01");
    expect(gap.until).toEqual({ value: "2027-04", precision: "month" });
    expect(gap.evidence.map((e) => e.quote)).toEqual(["Only ₹50K left this quarter", "new budget in April"]);
  });

  it("depends on the message timestamp: the same words in February give a gap-free result", () => {
    const m = msg("Only ₹50K left this quarter; new budget in April", "2027-02-10T10:00:00+05:30");
    const p = profileFrom(
      extraction([
        field("budget_now_amount", "₹50K", "Only ₹50K left this quarter"),
        field("budget_now_period", "this quarter", "Only ₹50K left this quarter"),
        field("next_budget_date", "April", "new budget in April"),
      ]),
      [m],
    );
    // Quarter ends 31 Mar 2027; budget opens Apr 2027 → no intervening gap.
    expect(p.budgetNow.value?.period).toEqual({ start: "2027-02-10", end: "2027-03-31" });
    expect(p.derivedBudgetGap).toBeNull();
  });

  it("produces no gap without a next-budget statement", () => {
    const m = msg("Only ₹50K left this quarter");
    const p = profileFrom(extraction([field("budget_now_amount", "₹50K", "Only ₹50K left this quarter"), field("budget_now_period", "this quarter", "Only ₹50K left this quarter")]), [m]);
    expect(p.derivedBudgetGap).toBeNull();
  });
});

describe("clarification answers", () => {
  it("resolve ambiguity, record who answered and through which channel", () => {
    const A = heroClarificationAnswers;
    const p = applyClarificationAnswer(profileFrom(), "amountsIncludeGst", "yes", A.gst);
    expect(p.amountsIncludeGst).toMatchObject({ status: "stated", value: "yes", clarification: { confirmedByBuyerVia: "whatsapp", recordedBy: A.gst.recordedBy } });
    expect(interpretations(p)).toHaveLength(2);
  });
  it("reject invalid answer values", () => {
    expect(() => applyClarificationAnswer(profileFrom(), "approvalScope", "yes", heroClarificationAnswers.approvalScope)).toThrow();
  });
});
