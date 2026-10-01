/**
 * Money is always integer paise in INR. No floating-point arithmetic touches amounts.
 */
export type Paise = number;
export const CURRENCY = "INR" as const;

export function assertPaise(value: number, label = "amount"): asserts value is Paise {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be an integer number of paise, got ${value}`);
}

export const rupees = (r: number): Paise => {
  const p = Math.round(r * 100);
  assertPaise(p);
  return p;
};

/** Integer division of a non-negative numerator, rounding half up. */
export function divRoundHalfUp(numerator: number, denominator: number): number {
  assertPaise(numerator, "numerator");
  if (numerator < 0 || denominator <= 0) throw new Error("divRoundHalfUp expects numerator ≥ 0 and denominator > 0");
  const q = Math.floor(numerator / denominator);
  const r = numerator - q * denominator;
  return r * 2 >= denominator ? q + 1 : q;
}

/** GST for one invoice line: round_half_up(pre × rateBps / 10000), in paise. */
export function gstForLine(prePaise: Paise, rateBps: number): Paise {
  assertPaise(prePaise, "pre-GST amount");
  if (prePaise < 0) throw new Error("Invoice line amount cannot be negative");
  return divRoundHalfUp(prePaise * rateBps, 10_000);
}

export interface GstLine {
  prePaise: Paise;
  gstPaise: Paise;
  totalPaise: Paise;
}

export function lineWithGst(prePaise: Paise, rateBps: number): GstLine {
  const gstPaise = gstForLine(prePaise, rateBps);
  return { prePaise, gstPaise, totalPaise: prePaise + gstPaise };
}

export interface DerivedPreGst {
  inclusivePaise: Paise;
  prePaise: Paise;
  gstPaise: Paise;
  totalPaise: Paise;
  /** inclusive − (pre + GST); 0 or a small positive residual, always displayed. */
  reconciliationPaise: Paise;
  rule: string;
}

/**
 * Derive the pre-GST amount from a GST-inclusive buyer amount: the largest pre-GST P
 * such that P + GST(P) ≤ inclusive, using the same per-line rounding rule.
 */
export function derivePreGstFromInclusive(inclusivePaise: Paise, rateBps: number): DerivedPreGst {
  assertPaise(inclusivePaise, "inclusive amount");
  let p = Math.floor((inclusivePaise * 10_000) / (10_000 + rateBps));
  while (p + gstForLine(p, rateBps) > inclusivePaise) p -= 1;
  while (p + 1 + gstForLine(p + 1, rateBps) <= inclusivePaise) p += 1;
  const line = lineWithGst(p, rateBps);
  return {
    inclusivePaise,
    prePaise: p,
    gstPaise: line.gstPaise,
    totalPaise: line.totalPaise,
    reconciliationPaise: inclusivePaise - line.totalPaise,
    rule: `Largest pre-GST amount whose GST at ${rateBps / 100}% (per line, rounded half-up to the paise) keeps the total within the stated amount`,
  };
}

/** Split a total into parts by basis-point weights; the rounding remainder goes to the first part. */
export function allocateByWeights(totalPaise: Paise, weightsBps: number[]): Paise[] {
  assertPaise(totalPaise);
  const sum = weightsBps.reduce((a, b) => a + b, 0);
  if (sum !== 10_000) throw new Error(`Weights must sum to 10000 bps, got ${sum}`);
  const parts = weightsBps.map((w) => Math.floor((totalPaise * w) / 10_000));
  parts[0] += totalPaise - parts.reduce((a, b) => a + b, 0);
  return parts;
}

/** Split a total into n equal parts; the rounding remainder goes to the first part. */
export function allocateEqually(totalPaise: Paise, n: number): Paise[] {
  assertPaise(totalPaise);
  if (!Number.isInteger(n) || n < 1) throw new Error("Need at least one part");
  const parts = Array.from({ length: n }, () => Math.floor(totalPaise / n));
  parts[0] += totalPaise - parts[0] * n;
  return parts;
}

/** ₹1,20,000.00 in Indian digit grouping. Display only. */
export function formatINR(paise: Paise, opts: { paise?: boolean } = {}): string {
  assertPaise(paise);
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupeePart = Math.floor(abs / 100);
  const paisePart = abs % 100;
  const s = String(rupeePart);
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
  const showPaise = opts.paise ?? paisePart !== 0;
  return `${negative ? "−" : ""}₹${grouped}${showPaise ? "." + String(paisePart).padStart(2, "0") : ""}`;
}

export const sum = (xs: Paise[]): Paise => xs.reduce((a, b) => a + b, 0);
