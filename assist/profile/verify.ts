import { statesAmount } from "./amount";
import type { ProfileInput, ProfileOutput } from "./schema";

export interface VerifiedValue {
  rupees: number;
  quote: string;
  start: number;
  end: number;
}
export interface ProposedService {
  name: string;
  kind: "one_time" | "monthly" | "unclear";
  listPrice: VerifiedValue | null;
  directCost: VerifiedValue | null;
}
export type DropReason = "quote_not_in_source" | "quote_ambiguous" | "value_not_in_quote" | "inside_instruction" | "name_not_near_quote" | "unsafe_name" | "no_verified_value";
export interface Dropped {
  service: string;
  field: "list_price" | "direct_cost" | "service";
  reason: DropReason;
}
export interface VerifiedProfile {
  services: ProposedService[];
  dropped: Dropped[];
  /** Text in the source that tries to instruct the reader. Shown to the merchant; never acted on. */
  instructionSpans: { start: number; end: number; text: string }[];
  /** What the model said it noticed, kept for the record. */
  modelFlagged: string[];
}

const INSTRUCTION = [
  /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(above|previous|prior|earlier|figures?|instructions?|rules?|costs?)\b/i,
  /\b(you are now|act as|admin mode|developer mode|system prompt|reveal your|do not summari[sz]e|reply only|respond only|output all)\b/i,
  /(^|\n)\s*\[?\s*(system|assistant|ai)\s*\]?\s*:/i,
  /\b(dear (ai|assistant)|note to the assistant|to the assistant|assistant:)\b/i,
  /\b(set|treat|make)\b[^.\n]{0,30}\b(all|every|each|the above)\b[^.\n]{0,40}\b(to|as)\b\s*(₹\s*)?(0|1|zero|free)\b/i,
  /\b(raise|lower|increase|decrease)\b[^.\n]{0,20}\b(every|all)\b[^.\n]{0,20}\bprices?\b/i,
  /\b(likh do|likho|bhool jao|ignore karo|ignore kar)\b/i,
];
const COMMENT = /<!--[\s\S]*?-->/g;
const FORMULA = /^[=+\-@\t\r]/;

/** Segments of the source (lines and sentences) that look like instructions. */
export function instructionSpans(source: string): VerifiedProfile["instructionSpans"] {
  const spans: VerifiedProfile["instructionSpans"] = [];
  // A hidden HTML comment is always suspicious. It is blanked (keeping offsets) before the rest is split into sentences.
  const comments = [...source.matchAll(COMMENT)];
  for (const m of comments) spans.push({ start: m.index!, end: m.index! + m[0].length, text: m[0].trim() });
  const visible = source.replace(COMMENT, (c) => " ".repeat(c.length));
  for (const m of visible.matchAll(/[^\n.!?]+(?:[.!?]+|$)/gm)) {
    const text = m[0];
    if (text.trim() && INSTRUCTION.some((p) => p.test(text))) spans.push({ start: m.index!, end: m.index! + text.length, text: source.slice(m.index!, m.index! + text.length).trim() });
  }
  return spans.sort((a, b) => a.start - b.start);
}

/** A quote must not cut through a number: "₹1" is not a quote of "₹12,000". */
export function splitsNumber(source: string, start: number, end: number): boolean {
  const before = source[start - 1] ?? "";
  const after = source[end] ?? "";
  const next = source[end + 1] ?? "";
  const first = source[start] ?? "";
  const last = source[end - 1] ?? "";
  return (/\d/.test(first) && /[\d]/.test(before)) || (/\d/.test(last) && (/\d/.test(after) || (/[.,]/.test(after) && /\d/.test(next))));
}

/** Where the quote sits: the single occurrence, or the one at the model's stated offset when it appears more than once. */
export function locateQuote(source: string, quote: string, hint: number): { start: number } | "missing" | "ambiguous" {
  const at: number[] = [];
  for (let i = source.indexOf(quote); i >= 0; i = source.indexOf(quote, i + 1)) at.push(i);
  if (!at.length) return "missing";
  if (at.length === 1) return { start: at[0]! };
  return at.includes(hint) ? { start: hint } : "ambiguous";
}

const words = (name: string) => name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);

/** The text a service's name must appear in: the line for a CSV, the 300 characters before the quote for prose. */
function nameWindow(input: ProfileInput, start: number, end: number): string {
  if (input.kind === "csv") {
    const from = input.source.lastIndexOf("\n", start - 1) + 1;
    const to = input.source.indexOf("\n", end);
    return input.source.slice(from, to < 0 ? input.source.length : to);
  }
  return input.source.slice(Math.max(0, start - 300), end);
}

/**
 * Keep a proposed value only when code can see it in the source: its quote is there, at one place, states
 * the amount, is not inside an instruction, and sits near the service's name. Everything else is dropped
 * and listed. A value the model made up cannot survive, whatever the model said about it.
 */
export function verifyProfile(input: ProfileInput, output: ProfileOutput): VerifiedProfile {
  const spans = instructionSpans(input.source);
  const dropped: Dropped[] = [];
  const services: ProposedService[] = [];

  for (const item of output.services) {
    const name = item.name.trim();
    if (!name || FORMULA.test(name) || /[<>]|https?:\/\//i.test(name)) {
      dropped.push({ service: name || "(blank)", field: "service", reason: "unsafe_name" });
      continue;
    }
    const drop = (field: "list_price" | "direct_cost", reason: DropReason): null => {
      dropped.push({ service: name, field, reason });
      return null;
    };
    const check = (field: "list_price" | "direct_cost"): VerifiedValue | null => {
      const value = item[field];
      if (!value) return null;
      const place = locateQuote(input.source, value.quote, value.start);
      if (place === "missing") return drop(field, "quote_not_in_source");
      if (place === "ambiguous") return drop(field, "quote_ambiguous");
      const end = place.start + value.quote.length;
      if (splitsNumber(input.source, place.start, end)) return drop(field, "quote_not_in_source");
      if (!statesAmount(value.quote, value.rupees)) return drop(field, "value_not_in_quote");
      if (spans.some((s) => place.start < s.end && end > s.start)) return drop(field, "inside_instruction");
      const near = nameWindow(input, place.start, end).toLowerCase();
      const need = words(name);
      if (need.length && need.filter((w) => near.includes(w)).length < Math.ceil(need.length / 2)) return drop(field, "name_not_near_quote");
      return { rupees: value.rupees, quote: value.quote, start: place.start, end };
    };
    const listPrice = check("list_price");
    const directCost = check("direct_cost");
    if (!listPrice && !directCost) {
      dropped.push({ service: name, field: "service", reason: "no_verified_value" });
      continue;
    }
    services.push({ name, kind: item.kind, listPrice, directCost });
  }
  return { services, dropped, instructionSpans: spans, modelFlagged: output.suspected_instructions };
}
