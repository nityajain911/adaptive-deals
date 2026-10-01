import { describe, expect, it } from "vitest";
import { classifyBuyerReply, nextDayOfMonthAfter } from "@/domain/replies";

const TZ = "Asia/Kolkata";
const at = (date: string, time = "12:30:00") => `${date}T${time}+05:30`;
const c = (text: string, ts: string) => classifyBuyerReply(text, ts, TZ);

describe("supported change phrase, normalised from the reply's own timestamp", () => {
  it("28 Nov ‘till the 20th’ → unavailable through 20 Dec; earliest debit 21 Dec", () => {
    expect(c("Cash is tight till the 20th.", at("2026-11-28"))).toMatchObject({ kind: "change_requested", phrase: "till the 20th", unavailableUntil: "2026-12-20", earliestDebit: "2026-12-21", replyDate: "2026-11-28" });
  });
  it("uses the reply timestamp: the same words on 1 Nov resolve to 20 Nov", () => {
    expect(c("Cash is tight till the 20th.", at("2026-11-01"))).toMatchObject({ unavailableUntil: "2026-11-20", earliestDebit: "2026-11-21" });
  });
  it("uses the merchant timezone: 20:00 UTC on 19 Nov is already 20 Nov in IST (same day → attention)", () => {
    expect(c("till the 20th", "2026-11-19T20:00:00Z")).toMatchObject({ kind: "needs_attention", reason: "same_day_ambiguous" });
    expect(c("till the 20th", "2026-11-19T10:00:00Z")).toMatchObject({ kind: "change_requested", unavailableUntil: "2026-11-20" });
  });
  it.each(["until the 20th", "up to the 20th", "upto 20th", "Till the 20TH please"])("accepts “%s”", (t) => {
    expect(c(t, at("2026-11-28"))).toMatchObject({ kind: "change_requested", unavailableUntil: "2026-12-20" });
  });
  it("month rollover across a year end", () => {
    expect(c("Cash is tight until the 5th", at("2026-12-28"))).toMatchObject({ unavailableUntil: "2027-01-05", earliestDebit: "2027-01-06" });
  });
  it("10 Feb 2027 ‘till the 30th’ → February has no 30th, so 30 Mar; earliest debit 31 Mar", () => {
    expect(nextDayOfMonthAfter("2027-02-10", 30)).toBe("2027-03-30");
    expect(c("Cash is tight till the 30th", at("2027-02-10"))).toMatchObject({ kind: "change_requested", unavailableUntil: "2027-03-30", earliestDebit: "2027-03-31" });
  });
  it("29 Apr 2027 ‘till the 31st’ → April has no 31st, so 31 May; earliest debit 1 Jun", () => {
    expect(nextDayOfMonthAfter("2027-04-29", 31)).toBe("2027-05-31");
    expect(c("till the 31st", at("2027-04-29"))).toMatchObject({ kind: "change_requested", unavailableUntil: "2027-05-31", earliestDebit: "2027-06-01" });
  });
  it("31 Jan 2027 ‘till the 30th’ → February has no 30th: merchant attention, never skips to March", () => {
    expect(nextDayOfMonthAfter("2027-01-31", 30)).toBeNull();
    expect(c("till the 30th", at("2027-01-31"))).toMatchObject({ kind: "needs_attention", reason: "unsupported_date_expression" });
  });
  it("an earlier day rolls to the following month when it exists there", () => {
    expect(nextDayOfMonthAfter("2027-03-31", 30)).toBe("2027-04-30");
    expect(nextDayOfMonthAfter("2026-11-28", 20)).toBe("2026-12-20");
  });
  it("same-day references still need merchant attention, including at a month end", () => {
    expect(c("till the 30th", at("2027-04-30"))).toMatchObject({ kind: "needs_attention", reason: "same_day_ambiguous" });
    expect(c("till the 31st", at("2027-01-31"))).toMatchObject({ kind: "needs_attention", reason: "same_day_ambiguous" });
  });
});

describe("everything else creates no change request", () => {
  it("same day: ambiguous between today and next month", () => {
    expect(c("Cash is tight till the 20th.", at("2026-11-20"))).toMatchObject({ kind: "needs_attention", reason: "same_day_ambiguous" });
  });
  it.each([
    ["Can we do up to ₹10K this month?", "amount_not_date"],
    ["up to 10k only", "amount_not_date"],
    ["20 tak paisa nahi hai", "unsupported_date_expression"],
    ["Cash tight till next week", "unsupported_date_expression"],
    ["Can't pay till salary comes", "unsupported_date_expression"],
    ["till 20th December please", "unsupported_date_expression"],
    ["Cash is tight till the 20th, maybe till the 25th", "multiple_dates"],
    ["I paid half, rest till the 20th", "mixed_intent"],
    ["Which bank account will it debit?", "question"],
    ["Sounds good", "unsupported"],
  ])("“%s” → merchant attention (%s)", (text, reason) => {
    expect(c(text, at("2026-11-28"))).toMatchObject({ kind: "needs_attention", reason });
  });
  it.each(["I paid", "I have already paid", "Payment done", "paid it already"])("“%s” is a payment claim only", (t) => {
    expect(c(t, at("2026-11-28")).kind).toBe("payment_claimed");
  });
  it.each(["Okay", "ok", "Okay, thanks!", "noted", "👍"])("“%s” is acknowledgement only", (t) => {
    expect(c(t, at("2026-11-28")).kind).toBe("acknowledgement");
  });
  it("normalises narrow no-break spaces and curly quotes before matching", () => {
    expect(c("Cash is tight till the 20th", at("2026-11-28")).kind).toBe("change_requested");
    expect(c("I’ve paid", at("2026-11-28")).kind).toBe("payment_claimed");
  });
});
