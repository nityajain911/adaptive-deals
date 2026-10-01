import { addMonths, daysInMonth, localDateOf, makeDate, parseDate, type CalendarDate } from "./dates";
import { earliestDebitAfterUnavailableUntil } from "./amendment";

/**
 * Deterministic, deliberately narrow classification of buyer replies in the simulated
 * conversation. Code — not AI — reads payment-change replies: the supported phrases are narrow
 * and a mistake moves money, so anything outside them goes to the merchant.
 *
 * Supported change phrase: "till | until | up to | upto" + an ordinal day of month
 * ("the 20th", "20th"), with no month named. The day resolves to its next occurrence strictly
 * after the reply's own date in the merchant timezone: this month, else the immediately following
 * month, else merchant attention. A reply sent on that day is ambiguous.
 */
export const REPLY_RULES_VERSION = "reply-rules.v1";

export type AttentionReason =
  | "same_day_ambiguous"
  | "amount_not_date"
  | "unsupported_date_expression"
  | "multiple_dates"
  | "mixed_intent"
  | "question"
  | "unsupported";

export type ReplyClassification =
  | {
      kind: "change_requested";
      phrase: string;
      /** Last day the buyer said cash is unavailable (inclusive). */
      unavailableUntil: CalendarDate;
      /** Earliest debit code may propose: the day after. */
      earliestDebit: CalendarDate;
      replyDate: CalendarDate;
      transformation: string;
    }
  | { kind: "payment_claimed"; phrase: string }
  | { kind: "acknowledgement" }
  | { kind: "needs_attention"; reason: AttentionReason; detail: string; phrase?: string };

export const CLASSIFICATION_LABEL: Record<ReplyClassification["kind"], string> = {
  change_requested: "Change requested",
  payment_claimed: "Payment claimed — verification required",
  acknowledgement: "Acknowledgement only",
  needs_attention: "Merchant attention needed",
};

function normalise(text: string): string {
  return text
    .replace(/[    ]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const MONTH_WORD = /^(?:\s*(?:of\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|this month|next month))\b/i;
const DATE_PHRASE = /\b(till|until|up to|upto)\s+(?:the\s+)?(\d{1,2})(st|nd|rd|th)\b/gi;
const AMOUNT_PHRASE = /\b(till|until|up to|upto)\s+(?:₹|rs\.?\s*|inr\s*)?\d[\d,]*(?:\.\d+)?\s*(?:k|l|lakh|lakhs|lac|cr|crore|thousand)?\b(?!\s*(?:st|nd|rd|th)\b)/i;
const CURRENCY_AMOUNT = /\b(up to|upto|till|until)\s+(?:₹|rs\.?|inr)/i;
const UNAVAILABILITY_WORD = /\b(till|until|up to|upto|tak)\b/i;
const PAYMENT_CLAIM = /\b(i(?:'ve| have)?\s+(?:already\s+)?paid|(?:have|has)\s+(?:already\s+)?paid|paid\s+(?:it|already|the\s+(?:amount|invoice|payment))|payment\s+(?:is\s+)?(?:done|made|sent|completed))\b/i;
const ACKNOWLEDGEMENT = /^(?:ok(?:ay)?|okk+|k|noted|sure|fine|got it|thanks?|thank you|ok,? thanks?|okay,? thanks?|👍)[.!\s]*$/i;

/**
 * Next occurrence of `day` strictly after `date`, bounded to two months:
 *   1. later this month, if this month has that day;
 *   2. otherwise the immediately following calendar month, if it has that day;
 *   3. otherwise null (merchant attention) — code never skips another month.
 * e.g. 10 Feb + 30th → 30 Mar; 29 Apr + 31st → 31 May; 31 Jan + 30th → null (no 30 Feb).
 * The same-day case is handled by the classifier before this is called.
 */
export function nextDayOfMonthAfter(date: CalendarDate, day: number): CalendarDate | null {
  if (day < 1 || day > 31) return null;
  const { y, m, d } = parseDate(date);
  if (day > d && day <= daysInMonth(y, m)) return makeDate(y, m, day);
  const next = parseDate(addMonths(makeDate(y, m, 1), 1));
  return day <= daysInMonth(next.y, next.m) ? makeDate(next.y, next.m, day) : null;
}

export function classifyBuyerReply(rawText: string, replyTimestamp: string, timeZone: string): ReplyClassification {
  const text = normalise(rawText);
  const replyDate = localDateOf(replyTimestamp, timeZone);

  const dates = [...text.matchAll(DATE_PHRASE)].filter((m) => !MONTH_WORD.test(text.slice((m.index ?? 0) + m[0].length)));
  const datesWithMonth = [...text.matchAll(DATE_PHRASE)].length - dates.length;
  const claim = PAYMENT_CLAIM.exec(text);

  if (claim && (dates.length || datesWithMonth)) {
    return { kind: "needs_attention", reason: "mixed_intent", detail: "The reply both claims a payment and mentions a date; the merchant should read it." };
  }
  if (claim) return { kind: "payment_claimed", phrase: claim[0] };
  if (ACKNOWLEDGEMENT.test(text)) return { kind: "acknowledgement" };

  if (datesWithMonth > 0) {
    return { kind: "needs_attention", reason: "unsupported_date_expression", detail: "A date with a month name is outside the supported phrases; ask the buyer to confirm the date." };
  }
  if (dates.length > 1 && new Set(dates.map((m) => Number(m[2]))).size > 1) {
    return { kind: "needs_attention", reason: "multiple_dates", detail: "The reply mentions more than one day; ask the buyer which applies." };
  }
  if (dates.length >= 1) {
    const m = dates[0];
    const day = Number(m[2]);
    const phrase = m[0];
    const { d } = parseDate(replyDate);
    if (day === d) {
      return { kind: "needs_attention", reason: "same_day_ambiguous", phrase, detail: `“${phrase}” was sent on the ${day}${m[3]} itself; it could mean today or next month. Ask the buyer for the date.` };
    }
    const until = nextDayOfMonthAfter(replyDate, day);
    if (!until) return { kind: "needs_attention", reason: "unsupported_date_expression", phrase, detail: `Day ${day} does not exist later this month or in the following month; ask the buyer for the date.` };
    return {
      kind: "change_requested",
      phrase,
      unavailableUntil: until,
      earliestDebit: earliestDebitAfterUnavailableUntil({ value: until, precision: "day" }),
      replyDate,
      transformation: `day ${day} → next occurrence strictly after the reply date ${replyDate} (${timeZone}) = ${until}; “${m[1].toLowerCase()}” is inclusive, so the earliest debit is the next day`,
    };
  }
  if (CURRENCY_AMOUNT.test(text) || AMOUNT_PHRASE.test(text)) {
    return { kind: "needs_attention", reason: "amount_not_date", phrase: (CURRENCY_AMOUNT.exec(text) ?? AMOUNT_PHRASE.exec(text))![0], detail: "This reads as an amount, not a date; the merchant should decide how to respond." };
  }
  if (UNAVAILABILITY_WORD.test(text)) {
    return { kind: "needs_attention", reason: "unsupported_date_expression", detail: "The buyer gave a timing constraint without one safely supported date; ask for the exact date." };
  }
  if (text.includes("?")) return { kind: "needs_attention", reason: "question", detail: "The buyer asked a question; the merchant should reply." };
  return { kind: "needs_attention", reason: "unsupported", detail: "The reply is outside the supported phrases; the merchant should read it." };
}
