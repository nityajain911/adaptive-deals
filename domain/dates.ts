/**
 * Calendar dates with explicit precision. All "today" values are derived from a supplied
 * timestamp (a message timestamp or an injected clock), never from the system clock.
 */
export type CalendarDate = string; // YYYY-MM-DD
export type YearMonth = string; // YYYY-MM
export type Precision = "day" | "month";

export interface DateValue {
  value: string; // YYYY-MM-DD for day, YYYY-MM for month
  precision: Precision;
}

export interface Period {
  start: CalendarDate;
  end: CalendarDate;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function makeDate(y: number, m: number, d: number): CalendarDate {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function parseDate(date: CalendarDate): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid calendar date "${date}"`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) throw new Error(`Invalid calendar date "${date}"`);
  return { y, m, d };
}

export function parseMonth(month: YearMonth): { y: number; m: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) throw new Error(`Invalid month "${month}"`);
  return { y: Number(match[1]), m: Number(match[2]) };
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export const monthOf = (date: CalendarDate): YearMonth => date.slice(0, 7);
export const startOfMonth = (month: YearMonth): CalendarDate => `${month}-01`;
export function endOfMonth(month: YearMonth): CalendarDate {
  const { y, m } = parseMonth(month);
  return makeDate(y, m, daysInMonth(y, m));
}

export function addDays(date: CalendarDate, n: number): CalendarDate {
  const { y, m, d } = parseDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return makeDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Add calendar months, clamping the day to the target month's length. */
export function addMonths(date: CalendarDate, n: number): CalendarDate {
  const { y, m, d } = parseDate(date);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return makeDate(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addMonthsToMonth(month: YearMonth, n: number): YearMonth {
  return monthOf(addMonths(startOfMonth(month), n));
}

export const compareDates = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Inclusive count of calendar months from a to b (same month = 1). */
export function monthsInclusive(a: CalendarDate | YearMonth, b: CalendarDate | YearMonth): number {
  const pa = parseMonth(a.slice(0, 7));
  const pb = parseMonth(b.slice(0, 7));
  return pb.y * 12 + pb.m - (pa.y * 12 + pa.m) + 1;
}

/** The calendar date of an instant in the given IANA timezone. */
export function localDateOf(isoTimestamp: string, timeZone: string): CalendarDate {
  const ms = Date.parse(isoTimestamp);
  if (Number.isNaN(ms)) throw new Error(`Invalid timestamp "${isoTimestamp}"`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ms);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Calendar quarter containing the date (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec). */
export function calendarQuarterOf(date: CalendarDate): Period {
  const { y, m } = parseDate(date);
  const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
  const start = makeDate(y, qStartMonth, 1);
  return { start, end: endOfMonth(monthOf(addMonths(start, 2))) };
}

export type Comparison = "pass" | "fail" | "undecidable";

/**
 * Budget becomes available at `available`. A proposed date after that month passes,
 * before it fails, within it is undecidable (needs the day).
 */
export function compareWithBudgetAvailable(proposed: CalendarDate, available: DateValue): Comparison {
  if (available.precision === "day") return compareDates(proposed, available.value) >= 0 ? "pass" : "fail";
  const pm = monthOf(proposed);
  const c = compareDates(pm, available.value);
  return c > 0 ? "pass" : c < 0 ? "fail" : "undecidable";
}

/** Deadline semantics, reversed: before the month passes, after fails, within is undecidable. */
export function compareWithDeadline(proposed: CalendarDate, deadline: DateValue): Comparison {
  if (deadline.precision === "day") return compareDates(proposed, deadline.value) <= 0 ? "pass" : "fail";
  const pm = monthOf(proposed);
  const c = compareDates(pm, deadline.value);
  return c < 0 ? "pass" : c > 0 ? "fail" : "undecidable";
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_ABBR = MONTHS.map((m) => m.slice(0, 3));
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

export type DateResult =
  | { ok: true; value: DateValue; transformation: string }
  | { ok: false; kind: "ambiguous"; readings: DateValue[]; reason: string }
  | { ok: false; kind: "unsupported"; reason: string };

function monthIndex(token: string): number | null {
  const t = token.toLowerCase().replace(/[^a-z]/g, "");
  const i = MONTHS.indexOf(t);
  if (i >= 0) return i + 1;
  const j = MONTH_ABBR.indexOf(t);
  return j >= 0 ? j + 1 : null;
}

/** "may" is a month only in a date context ("in May", "May 5"), not the modal verb. */
function isMonthMay(tokens: string[], i: number): boolean {
  if (tokens.length === 1) return true;
  const prev = tokens[i - 1] ?? "";
  const next = tokens[i + 1] ?? "";
  return /^(in|next|by|till|until|from|of|after|this|early|mid|late)$/.test(prev) || /^\d/.test(prev) || /^\d/.test(next);
}

function ordinalDay(text: string): number | null {
  const m = /\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/.exec(text);
  return m ? Number(m[1]) : null;
}

function dayBesideNamedMonth(text: string): number | null {
  const before = /\b(\d{1,2})(?:st|nd|rd|th)?\s+[a-z]{3,9}\b/.exec(text);
  if (before) return Number(before[1]);
  const after = /\b[a-z]{3,9}\s+(\d{1,2})(?:st|nd|rd|th)?\b/.exec(text);
  return after ? Number(after[1]) : null;
}

/**
 * Normalise a relative date phrase against the message's own timestamp in the merchant timezone.
 * Never guesses: phrases with more than one safe reading return `ambiguous`.
 */
export function normaliseRelativeDate(raw: string, messageTimestamp: string, timeZone: string): DateResult {
  const text = raw.trim().toLowerCase();
  const today = localDateOf(messageTimestamp, timeZone);
  const { y, m, d } = parseDate(today);

  if (/\bq[1-4]\b/.test(text)) {
    return { ok: false, kind: "unsupported", reason: `"${raw}": quarter labels are ambiguous between calendar and financial-year conventions` };
  }

  // after three months / in 3 months
  const rel = /\b(?:after|in)\s+(\d{1,2}|[a-z]+)\s+months?\b/.exec(text);
  if (rel) {
    const n = /^\d+$/.test(rel[1]) ? Number(rel[1]) : NUMBER_WORDS[rel[1]];
    if (n) {
      return { ok: true, value: { value: addMonths(today, n), precision: "day" }, transformation: `message date ${today} + ${n} months` };
    }
  }

  if (/\bnext month\b/.test(text)) {
    return { ok: true, value: { value: addMonthsToMonth(monthOf(today), 1), precision: "month" }, transformation: `month after ${monthOf(today)}` };
  }

  // till the 20th / by the 5th (no month named)
  const day = ordinalDay(text) ?? dayBesideNamedMonth(text);
  const monthTokens = text
    .split(/\s+/)
    .filter((t, i, all) => t.replace(/[^a-z]/g, "") !== "may" || isMonthMay(all, i))
    .map(monthIndex)
    .filter((x): x is number => x !== null);
  if (day !== null && monthTokens.length === 0) {
    let target = makeDate(y, m, Math.min(day, daysInMonth(y, m)));
    if (day < d) {
      const next = addMonths(makeDate(y, m, 1), 1);
      const p = parseDate(next);
      if (day > daysInMonth(p.y, p.m)) return { ok: false, kind: "unsupported", reason: `no day ${day} next month` };
      target = makeDate(p.y, p.m, day);
    } else if (day > daysInMonth(y, m)) {
      return { ok: false, kind: "unsupported", reason: `no day ${day} this month` };
    }
    return { ok: true, value: { value: target, precision: "day" }, transformation: `next occurrence of day ${day} on or after message date ${today}` };
  }

  if (monthTokens.length === 1) {
    const target = monthTokens[0];
    const explicitNext = /\bnext\b/.test(text);
    let year: number;
    if (target > m) year = y;
    else if (target < m) year = y + 1;
    else {
      if (day !== null && !explicitNext) {
        year = day >= d ? y : y + 1;
      } else if (!explicitNext) {
        return {
          ok: false,
          kind: "ambiguous",
          readings: [
            { value: makeDate(y, target, 1).slice(0, 7), precision: "month" },
            { value: makeDate(y + 1, target, 1).slice(0, 7), precision: "month" },
          ],
          reason: `"${raw}" was written during that month; it could mean this month or next year`,
        };
      } else year = y + 1;
    }
    const value = makeDate(year, target, 1).slice(0, 7);
    if (day !== null) {
      if (day > daysInMonth(year, target)) return { ok: false, kind: "unsupported", reason: `no day ${day} in ${value}` };
      return { ok: true, value: { value: makeDate(year, target, day), precision: "day" }, transformation: `next ${MONTHS[target - 1]} after message date ${today}, day ${day}` };
    }
    return { ok: true, value: { value, precision: "month" }, transformation: `next ${MONTHS[target - 1]} after message date ${today}; month precision kept` };
  }

  if (/\b(end of (the )?month|month[- ]end)\b/.test(text)) {
    return { ok: true, value: { value: endOfMonth(monthOf(today)), precision: "day" }, transformation: `last day of ${monthOf(today)}` };
  }

  return { ok: false, kind: "unsupported", reason: `"${raw}" cannot be safely normalised to a date` };
}

export type PeriodResult =
  | { ok: true; period: Period; transformation: string }
  | { ok: false; kind: "ambiguous" | "unsupported"; reason: string };

/** Current-period phrases such as "this quarter" or "this month", from the message timestamp. */
export function normaliseCurrentPeriod(raw: string, messageTimestamp: string, timeZone: string): PeriodResult {
  const text = raw.trim().toLowerCase();
  const today = localDateOf(messageTimestamp, timeZone);
  if (/\bq[1-4]\b/.test(text)) {
    return { ok: false, kind: "ambiguous", reason: `"${raw}": Q-labels differ between calendar and Indian financial-year numbering` };
  }
  // "is quarter" is the Hinglish form of "this quarter".
  if (/\b(this|is) quarter\b/.test(text)) {
    const q = calendarQuarterOf(today);
    return { ok: true, period: { start: today, end: q.end }, transformation: `calendar quarter containing message date ${today} (${q.start} to ${q.end}); from message date` };
  }
  if (/\b(this month|is mahine|is month)\b/.test(text)) {
    return { ok: true, period: { start: today, end: endOfMonth(monthOf(today)) }, transformation: `rest of ${monthOf(today)} from message date` };
  }
  return { ok: false, kind: "unsupported", reason: `"${raw}" is not a supported budget period` };
}

export function formatDateValue(v: DateValue): string {
  if (v.precision === "month") {
    const { y, m } = parseMonth(v.value);
    return `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1, 3)} ${y}`;
  }
  return formatDate(v.value);
}

export function formatDate(date: CalendarDate): string {
  const { y, m, d } = parseDate(date);
  return `${d} ${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1, 3)} ${y}`;
}
