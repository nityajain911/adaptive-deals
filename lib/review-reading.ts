import { createHash } from "node:crypto";
import { PROMPTS } from "@/ai/prompts";
import type { StructuredRequest } from "@/ai/provider";
import { ReviewReadingSchema } from "@/ai/schemas";
import type { ReviewChange } from "@/domain/conversation";
import { daysInMonth, localDateOf, makeDate, parseDate, type CalendarDate } from "@/domain/dates";
import type { ServicePackage } from "@/domain/types";

/** Text in the reply must not be able to close or forge the <reply> delimiters. */
const neutralise = (text: string) => text.replace(/<(\/?)reply\b/gi, "‹$1reply");

/** The request that has a model read a buyer's answer at the month-three review. */
export function buildReviewReadRequest(replyText: string): StructuredRequest {
  const prompt = PROMPTS.read_review;
  const user = `Reply (untrusted data):\n<reply>\n${neutralise(replyText)}\n</reply>\n\nRead what the buyer wants.`;
  return { task: "read_review", prompt, user, schema: ReviewReadingSchema, inputHash: createHash("sha256").update(`${prompt.version}\n${user}`, "utf8").digest("hex") };
}

export interface ReviewReadingResult {
  decision: "proceed" | "stop" | "changes";
  phrase: string;
  change: ReviewChange | null;
}
export type ReviewReadingVerdict = { ok: true; reading: ReviewReadingResult } | { ok: false; reason: string };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ws = (text: string) => text.replace(/[   ]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
const daysBetween = (from: CalendarDate, to: CalendarDate) => { const a = parseDate(from); const b = parseDate(to); return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000); };

/** "₹60,000", "Rs 60000", "60k" or "1 lakh" as paise; null when it is not an amount code can read. */
export function amountPaise(text: string): number | null {
  const t = ws(text).replace(/₹|rs\.?|inr/g, "").replace(/,/g, "").trim();
  const m = /^(\d+(?:\.\d+)?)\s*(k|lakh|lakhs|lac|l)?$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === "k" ? 1_000 : m[2] ? 100_000 : 1);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

/** "1 April", "1st April" or "April 1" as the next such day after the reply; null when it is not a date code can read. */
export function dateAfter(text: string, replyDate: CalendarDate): CalendarDate | null {
  const t = ws(text).replace(/,/g, "");
  const dayFirst = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)$/.exec(t);
  const monthFirst = /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?$/.exec(t);
  const [dayText, monthText] = dayFirst ? [dayFirst[1], dayFirst[2]] : monthFirst ? [monthFirst[2], monthFirst[1]] : [null, null];
  if (!dayText || !monthText) return null;
  const month = MONTHS.findIndex((m) => monthText.startsWith(m)) + 1;
  const day = Number(dayText);
  if (!month || day < 1) return null;
  const { y } = parseDate(replyDate);
  for (const year of [y, y + 1]) {
    if (day > daysInMonth(year, month)) continue;
    const date = makeDate(year, month, day);
    if (daysBetween(replyDate, date) > 0) return date;
  }
  return null;
}

/**
 * Check what a model read against the reply itself. The model's words are never trusted: the decision phrase and each named
 * amount, date and service must be in the reply; code turns the amount into paise, the date into a calendar day after the reply and
 * the service into one of the merchant's own services; and a decision that is not "changes" may carry no change. Anything else is
 * rejected, and the reply is then left for the merchant to read.
 */
export function verifyReviewReading(raw: unknown, replyText: string, replyTimestamp: string, timeZone: string, packages: Pick<ServicePackage, "id" | "name">[]): ReviewReadingVerdict {
  const parsed = ReviewReadingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "The answer did not match the expected format." };
  const r = parsed.data;
  if (r.decision === "unclear") return { ok: false, reason: "The reply does not say what the buyer wants." };
  const text = ws(replyText);
  const has = (words: string) => text.includes(ws(words));
  if (!has(r.phrase)) return { ok: false, reason: "The quoted words are not in the reply." };
  const named = [r.change_kind, r.amount_text, r.date_text, r.service_text].filter((x) => x !== null);
  if (r.decision !== "changes") return named.length ? { ok: false, reason: "A change was named for a reply that does not ask for one." } : { ok: true, reading: { decision: r.decision, phrase: r.phrase.trim(), change: null } };
  if (!r.change_kind) return { ok: false, reason: "The reply asks for a change but no change was named." };
  if (r.change_kind === "lower_price") {
    if (!r.amount_text || r.date_text !== null || r.service_text !== null) return { ok: false, reason: "A lower price needs one amount and nothing else." };
    if (!has(r.amount_text)) return { ok: false, reason: "The amount is not in the reply." };
    const paise = amountPaise(r.amount_text);
    return paise ? { ok: true, reading: { decision: "changes", phrase: r.phrase.trim(), change: { kind: "lower_price", targetPaise: paise } } } : { ok: false, reason: "The amount is not one code can read." };
  }
  if (r.change_kind === "later_start") {
    if (!r.date_text || r.amount_text !== null || r.service_text !== null) return { ok: false, reason: "A later start needs one date and nothing else." };
    if (!has(r.date_text)) return { ok: false, reason: "The date is not in the reply." };
    const date = dateAfter(r.date_text, localDateOf(replyTimestamp, timeZone));
    if (!date) return { ok: false, reason: "The date is not one code can read." };
    if (daysBetween(localDateOf(replyTimestamp, timeZone), date) > 548) return { ok: false, reason: "The date is more than about eighteen months after the reply." };
    return { ok: true, reading: { decision: "changes", phrase: r.phrase.trim(), change: { kind: "later_start", startDate: date } } };
  }
  if (!r.service_text || r.amount_text !== null || r.date_text !== null) return { ok: false, reason: "Leaving a service out needs one service and nothing else." };
  if (!has(r.service_text)) return { ok: false, reason: "The service is not in the reply." };
  const wanted = ws(r.service_text);
  const matches = packages.filter((p) => ws(p.name) === wanted);
  return matches.length === 1 ? { ok: true, reading: { decision: "changes", phrase: r.phrase.trim(), change: { kind: "leave_out", removePackageId: matches[0].id } } } : { ok: false, reason: "The service is not one of the merchant's services." };
}
