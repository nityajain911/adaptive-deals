import { describe, expect, it } from "vitest";
import {
  calendarQuarterOf,
  compareWithBudgetAvailable,
  compareWithDeadline,
  localDateOf,
  normaliseCurrentPeriod,
  normaliseRelativeDate,
  type DateValue,
} from "@/domain/dates";

const TZ = "Asia/Kolkata";
const ok = (raw: string, ts: string) => {
  const r = normaliseRelativeDate(raw, ts, TZ);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};

describe("relative dates are normalised from each message's own timestamp", () => {
  it("'April' from an October message is next year's April, month precision kept", () => {
    expect(ok("April", "2026-10-01T08:47:00+05:30")).toEqual({ value: "2027-04", precision: "month" });
    expect(ok("next April", "2026-10-01T08:47:00+05:30")).toEqual({ value: "2027-04", precision: "month" });
  });
  it("'April' from a February message is the same year's April", () => {
    expect(ok("in April", "2027-02-10T10:00:00+05:30")).toEqual({ value: "2027-04", precision: "month" });
  });
  it("the same phrase gives different answers for different message timestamps", () => {
    expect(ok("after three months", "2026-10-01T08:47:00+05:30")).toEqual({ value: "2027-01-01", precision: "day" });
    expect(ok("after three months", "2026-11-30T08:47:00+05:30")).toEqual({ value: "2027-02-28", precision: "day" });
  });
  it("'till the 20th' resolves within the reply's month, or the next month once the day has passed", () => {
    expect(ok("till the 20th", "2026-12-01T11:05:00+05:30")).toEqual({ value: "2026-12-20", precision: "day" });
    expect(ok("till the 20th", "2026-12-22T11:05:00+05:30")).toEqual({ value: "2027-01-20", precision: "day" });
  });
  it("uses the merchant timezone, not UTC, to decide the message date", () => {
    // 20:00 UTC on 30 Sep is 01:30 IST on 1 Oct — a different quarter.
    expect(localDateOf("2026-09-30T20:00:00Z", TZ)).toBe("2026-10-01");
    const p = normaliseCurrentPeriod("this quarter", "2026-09-30T20:00:00Z", TZ);
    expect(p.ok && p.period).toEqual({ start: "2026-10-01", end: "2026-12-31" });
  });
  it("does not guess: a month named during that same month is ambiguous", () => {
    const r = normaliseRelativeDate("April", "2027-04-10T10:00:00+05:30", TZ);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.kind).toBe("ambiguous");
  });
  it("reads a bare 'May' as the month", () => {
    expect(ok("May", "2026-10-01T08:47:00+05:30")).toEqual({ value: "2027-05", precision: "month" });
  });
  it("reads an explicit day and month as the next occurrence with day precision", () => {
    expect(ok("1 May", "2026-10-01T08:47:00+05:30")).toEqual({ value: "2027-05-01", precision: "day" });
    expect(ok("May 1", "2026-10-01T08:47:00+05:30")).toEqual({ value: "2027-05-01", precision: "day" });
    expect(ok("1 October", "2026-10-01T08:47:00+05:30")).toEqual({ value: "2026-10-01", precision: "day" });
    expect(ok("1 October", "2026-10-02T08:47:00+05:30")).toEqual({ value: "2027-10-01", precision: "day" });
  });
  it("does not treat the verb 'may' as a month", () => {
    expect(ok("we may pay by the 20th", "2026-12-01T11:05:00+05:30")).toEqual({ value: "2026-12-20", precision: "day" });
  });
  it("treats Q-labels as ambiguous between calendar and financial-year numbering", () => {
    expect(normaliseCurrentPeriod("Q3", "2026-10-01T08:47:00+05:30", TZ).ok).toBe(false);
  });
  it("'this quarter' is the calendar quarter containing the message", () => {
    expect(calendarQuarterOf("2026-10-01")).toEqual({ start: "2026-10-01", end: "2026-12-31" });
    expect(calendarQuarterOf("2027-02-15")).toEqual({ start: "2027-01-01", end: "2027-03-31" });
  });
});

describe("month-precision comparisons", () => {
  const april: DateValue = { value: "2027-04", precision: "month" };
  it("budget-available month: after passes, before fails, within needs information", () => {
    expect(compareWithBudgetAvailable("2027-05-01", april)).toBe("pass");
    expect(compareWithBudgetAvailable("2027-03-31", april)).toBe("fail");
    expect(compareWithBudgetAvailable("2027-04-01", april)).toBe("undecidable");
    expect(compareWithBudgetAvailable("2027-04-30", april)).toBe("undecidable");
  });
  it("deadline month: reversed direction", () => {
    expect(compareWithDeadline("2027-03-31", april)).toBe("pass");
    expect(compareWithDeadline("2027-05-01", april)).toBe("fail");
    expect(compareWithDeadline("2027-04-15", april)).toBe("undecidable");
  });
  it("day precision is decidable", () => {
    const d: DateValue = { value: "2027-04-10", precision: "day" };
    expect(compareWithBudgetAvailable("2027-04-10", d)).toBe("pass");
    expect(compareWithBudgetAvailable("2027-04-09", d)).toBe("fail");
    expect(compareWithDeadline("2027-04-10", d)).toBe("pass");
    expect(compareWithDeadline("2027-04-11", d)).toBe("fail");
  });
});
