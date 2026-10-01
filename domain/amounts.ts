import type { Paise } from "./money";

/**
 * Deterministic amount normalisation. AI returns raw text; this code turns it into paise.
 * Supported: ₹50K, 50k, Rs 50,000, 1,20,000, fifty thousand, 1.2 lakh, 2 crore, one lakh twenty thousand.
 */
export type AmountResult =
  | { ok: true; paise: Paise; transformation: string }
  | { ok: false; reason: string };

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  thousands: 1_000,
  l: 100_000,
  lac: 100_000,
  lacs: 100_000,
  lakh: 100_000,
  lakhs: 100_000,
  cr: 10_000_000,
  crore: 10_000_000,
  crores: 10_000_000,
};

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

function cleanCurrency(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^(₹|rs\.?|inr)\s*/, "")
    .replace(/\s*(rupees|rs\.?|inr|\/-)$/, "")
    .trim();
}

/** Decimal string → paise-safe integer arithmetic (avoids 1.2 × 100000 float drift). */
function decimalTimes(numeric: string, multiplierRupees: number): number | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(numeric);
  if (!m) return null;
  const whole = m[1];
  const frac = m[2] ?? "";
  const scale = 10 ** frac.length;
  const scaled = Number(whole + frac); // value × scale
  const paiseTimesScale = scaled * multiplierRupees * 100;
  if (paiseTimesScale % scale !== 0) return null; // would produce fractional paise
  return paiseTimesScale / scale;
}

function parseWords(text: string): number | null {
  const tokens = text.replace(/-/g, " ").replace(/\band\b/g, " ").split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  let total = 0;
  let current = 0;
  for (const t of tokens) {
    if (t in UNITS) current += UNITS[t];
    else if (t === "hundred") current = (current || 1) * 100;
    else if (t in MULTIPLIERS && MULTIPLIERS[t] >= 1_000) {
      total += (current || 1) * MULTIPLIERS[t];
      current = 0;
    } else return null;
  }
  return total + current;
}

export function normaliseAmount(raw: string): AmountResult {
  const text = cleanCurrency(raw);
  if (!text) return { ok: false, reason: "empty amount" };

  // 50k, 1.2 lakh, ₹50K, 2 cr
  const suffixed = /^(\d+(?:\.\d+)?)\s*([a-z]+)$/.exec(text.replace(/,/g, ""));
  if (suffixed && suffixed[2] in MULTIPLIERS) {
    const paise = decimalTimes(suffixed[1], MULTIPLIERS[suffixed[2]]);
    if (paise === null) return { ok: false, reason: `"${raw}" does not resolve to whole paise` };
    return { ok: true, paise, transformation: `${suffixed[1]} × ${MULTIPLIERS[suffixed[2]].toLocaleString("en-IN")} (${suffixed[2]})` };
  }

  // 50,000 / 1,20,000 / 50000.50
  if (/^\d{1,3}(,\d{2,3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$/.test(text)) {
    const paise = decimalTimes(text.replace(/,/g, ""), 1);
    if (paise === null) return { ok: false, reason: `"${raw}" is not a valid amount` };
    return { ok: true, paise, transformation: "numeric rupees" };
  }

  // fifty thousand, one lakh twenty thousand
  const words = parseWords(text);
  if (words !== null && words > 0) {
    return { ok: true, paise: words * 100, transformation: `number words → ${words.toLocaleString("en-IN")}` };
  }

  return { ok: false, reason: `"${raw}" cannot be safely normalised to an amount` };
}
