/**
 * Reads the rupee amounts a piece of text states. Code, not the model, decides whether a proposed value is
 * really in its quote: a value survives only if it equals an amount found here.
 */
const UNITS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = { thousand: 1_000, lakh: 100_000, lakhs: 100_000, lac: 100_000, lacs: 100_000, crore: 10_000_000 };
const MULTIPLIER: Record<string, number> = { k: 1_000, thousand: 1_000, lakh: 100_000, lakhs: 100_000, lac: 100_000, lacs: 100_000, crore: 10_000_000, cr: 10_000_000 };

const NUMERIC = /(?<![\d.])(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d+)?(?:\s*(k|thousand|lakhs?|lacs?|crore|cr)\b)?/gi;

function wordAmounts(text: string): number[] {
  const tokens = text.toLowerCase().replace(/-/g, " ").split(/[^a-z]+/).filter(Boolean);
  const found: number[] = [];
  let total = 0, current = 0, active = false;
  const flush = () => {
    if (active) found.push(total + current);
    total = 0; current = 0; active = false;
  };
  for (const token of tokens) {
    if (token in UNITS) { current += UNITS[token]!; active = true; }
    else if (token === "hundred") { current = (current || 1) * 100; active = true; }
    else if (token in SCALES) { total += (current || 1) * SCALES[token]!; current = 0; active = true; }
    else if (token === "and" && active) continue;
    else flush();
  }
  flush();
  return found.filter((n) => n > 0);
}

/** Every rupee amount the text states, in rupees. */
export function amountsIn(text: string): number[] {
  const out: number[] = [];
  for (const match of text.matchAll(NUMERIC)) {
    const base = Number(`${match[1]!.replace(/,/g, "")}${match[2] ?? ""}`);
    const mult = match[3] ? MULTIPLIER[match[3].toLowerCase()]! : 1;
    out.push(Math.round(base * mult * 100) / 100);
  }
  return [...out, ...wordAmounts(text)];
}

export const statesAmount = (text: string, rupees: number): boolean => amountsIn(text).some((n) => Math.abs(n - rupees) < 0.005);
