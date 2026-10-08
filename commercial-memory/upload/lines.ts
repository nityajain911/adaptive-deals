import type { UploadNote } from "./limits";

export interface ServiceRef {
  id: string;
  name: string;
}

export interface LineReading {
  line: string;
  start: number;
  end: number;
  service: ServiceRef | null;
  /** The one amount in rupees, or null when the line has none or more than one. */
  rupees: number | null;
  note: UploadNote | null;
}

const norm = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/** Services whose full name appears in the text as a phrase. */
export function servicesIn(text: string, services: ServiceRef[]): ServiceRef[] {
  const lower = norm(text);
  return services.filter((service) => new RegExp(`(^|[^a-z])${norm(service.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(lower));
}

const SCALE: Record<string, number> = { k: 1_000, thousand: 1_000, lakh: 100_000, lakhs: 100_000, lac: 100_000, lacs: 100_000, crore: 10_000_000, cr: 10_000_000 };
const scaled = (digits: string, scale?: string) => Math.round(Number(digits.replace(/,/g, "")) * (scale ? SCALE[scale.toLowerCase()]! : 1) * 100) / 100;

/**
 * The amounts a text states as money, in rupees. Money is a number next to a rupee marker (₹, Rs, INR, rupees),
 * or, when the text has no marker at all, a bare number of three or more digits, or any number with a magnitude
 * word (k, thousand, lakh, crore). A number in "3 months" or "12 payments" is never read as money.
 */
export function moneyMentions(text: string): number[] {
  const marked: number[] = [];
  for (const m of text.matchAll(/(?:₹|\brs\.?|\binr)\s*(\d[\d,]*(?:\.\d+)?)(?:\s*(k|thousand|lakhs?|lacs?|crore|cr)\b)?/gi)) marked.push(scaled(m[1]!, m[2]));
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)(?:\s*(k|thousand|lakhs?|lacs?|crore|cr)\b)?\s*(?:rupees|inr|rs)\b/gi)) marked.push(scaled(m[1]!, m[2]));
  if (marked.length) return [...new Set(marked)];
  const bare: number[] = [];
  for (const m of text.matchAll(/(?<![\w.,])(\d{1,3}(?:,\d{2,3})+|\d{3,})(\.\d+)?(?:\s*(k|thousand|lakhs?|lacs?|crore|cr)\b)?/gi)) bare.push(scaled(`${m[1]}${m[2] ?? ""}`, m[3]));
  for (const m of text.matchAll(/(?<![\w.,])(\d{1,2}(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?|crore|cr)\b/gi)) bare.push(scaled(m[1]!, m[2]));
  return [...new Set(bare)];
}

/** The single amount stated in a piece of text, in rupees; null when none or more than one distinct amount. */
export function singleAmount(text: string, service: ServiceRef | null = null): number | null {
  const withoutName = service ? text.replace(new RegExp(service.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ") : text;
  const found = moneyMentions(withoutName).filter((value) => value > 0);
  return found.length === 1 ? found[0]! : null;
}

/** One line of plain text (or text from a PDF) read as "service ... amount". Never guesses. */
export function readLine(line: string, start: number, services: ServiceRef[]): LineReading {
  const found = servicesIn(line, services);
  const base = { line, start, end: start + line.length };
  if (found.length === 0) return { ...base, service: null, rupees: null, note: { line, reason: "No service from your Business economics is named on this line" } };
  if (found.length > 1) return { ...base, service: null, rupees: null, note: { line, reason: "More than one service is named on this line" } };
  const rupees = singleAmount(line, found[0]!);
  if (rupees === null) return { ...base, service: found[0]!, rupees: null, note: { line, reason: "This line must state exactly one amount" } };
  return { ...base, service: found[0]!, rupees, note: null };
}
