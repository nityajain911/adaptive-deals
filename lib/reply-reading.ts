import { createHash } from "node:crypto";
import { PROMPTS } from "@/ai/prompts";
import type { StructuredRequest } from "@/ai/provider";
import { PaymentReplyReadingSchema } from "@/ai/schemas";
import { earliestDebitAfterUnavailableUntil } from "@/domain/amendment";
import { addDays, daysInMonth, localDateOf, makeDate, parseDate, type CalendarDate } from "@/domain/dates";
import { nextDayOfMonthAfter } from "@/domain/replies";

/** Text in the reply must not be able to close or forge the <reply> delimiters. */
const neutralise = (text: string) => text.replace(/<(\/?)reply\b/gi, "‹$1reply");

export function buildReplyReadRequest(replyText: string): StructuredRequest {
  const prompt = PROMPTS.read_reply;
  const user = `Reply (untrusted data):\n<reply>\n${neutralise(replyText)}\n</reply>\n\nRead the date.`;
  return { task: "read_reply", prompt, user, schema: PaymentReplyReadingSchema, inputHash: createHash("sha256").update(`${prompt.version}\n${user}`, "utf8").digest("hex") };
}

export interface ReplySuggestionReading {
  phrase: string;
  unavailableUntil: CalendarDate;
  earliestDebit: CalendarDate;
  replyDate: CalendarDate;
  direction: "until" | "after" | "from";
}

export type ReplyReadingVerdict = { ok: true; reading: ReplySuggestionReading } | { ok: false; reason: string };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ws = (text: string) => text.replace(/[\u00a0\u202f\u2009]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
const daysBetween = (from: CalendarDate, to: CalendarDate) => { const a = parseDate(from); const b = parseDate(to); return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000); };

/**
 * Check what a model proposed against the reply itself. The model's words are never trusted: the quote must be in the reply
 * and contain the day it names, the direction must be stated, and code (not the model) works out the calendar date, which must
 * fall after the reply and within about two months. What survives is only a suggestion for the merchant to confirm.
 */
export function verifyReplyReading(raw: unknown, replyText: string, replyTimestamp: string, timeZone: string): ReplyReadingVerdict {
  const parsed = PaymentReplyReadingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "The answer did not match the expected format." };
  const { phrase, direction } = parsed.data;
  const dayMatch = /^\s*0?(\d{1,2})(?:st|nd|rd|th)?\s*$/i.exec(parsed.data.day_text);
  const day = dayMatch ? Number(dayMatch[1]) : 0;
  if (day < 1 || day > 31) return { ok: false, reason: "The day is not a day of the month." };
  const monthName = parsed.data.month_text === null ? null : MONTHS.findIndex((m) => ws(parsed.data.month_text!).startsWith(m)) + 1;
  if (parsed.data.month_text !== null && !monthName) return { ok: false, reason: "The month is not a month." };
  const month = monthName;
  if (direction === "unclear") return { ok: false, reason: "The reply does not say which way the date applies." };
  const text = ws(replyText);
  const quote = ws(phrase);
  if (!quote || !text.includes(quote)) return { ok: false, reason: "The quoted words are not in the reply." };
  if (!new RegExp(`(^|\\D)0?${day}(\\D|$)`).test(quote)) return { ok: false, reason: "The quoted words do not contain the day." };
  if (month !== null && !quote.includes(ws(parsed.data.month_text!))) return { ok: false, reason: "The quoted words do not contain the month." };
  const replyDate = localDateOf(replyTimestamp, timeZone);
  let date: CalendarDate | null;
  if (month === null) date = nextDayOfMonthAfter(replyDate, day);
  else {
    const { y } = parseDate(replyDate);
    const inYear = (year: number) => (day <= daysInMonth(year, month) ? makeDate(year, month, day) : null);
    const thisYear = inYear(y);
    date = thisYear && daysBetween(replyDate, thisYear) > 0 ? thisYear : inYear(y + 1);
  }
  if (!date) return { ok: false, reason: "That day does not exist in the month it points to." };
  const away = daysBetween(replyDate, date);
  if (away < 1 || away > 62) return { ok: false, reason: "The date is not within about two months after the reply." };
  const unavailableUntil = direction === "from" ? addDays(date, -1) : date;
  if (daysBetween(replyDate, unavailableUntil) < 0) return { ok: false, reason: "The date is not after the reply." };
  return { ok: true, reading: { phrase: phrase.trim(), unavailableUntil, earliestDebit: earliestDebitAfterUnavailableUntil({ value: unavailableUntil, precision: "day" }), replyDate, direction } };
}

/** A suggested reading of a reply code's own rules could not read. It changes nothing until the merchant uses it. */
export interface ReplySuggestion extends ReplySuggestionReading {
  messageId: string;
  state: "pending" | "used" | "ignored";
  /** Which provider answered and which were tried first. Shown only in the audit, never to the merchant. */
  provider: string;
  model: string;
  attempts: { provider: string; model: string; outcome: string; detail?: string }[];
  at: string;
}
