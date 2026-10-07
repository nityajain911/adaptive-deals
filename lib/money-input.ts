/** "₹10,000" or "10000.50" → paise, or null when it is not a positive amount. */
export function toPaise(text: string): number | null {
  const cleaned = text.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const paise = Math.round(Number(cleaned) * 100);
  return paise > 0 ? paise : null;
}

/** The same parsing rule for cost and optional-floor fields, where zero is valid. */
export function toNonNegativePaise(text: string): number | null {
  const cleaned = text.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const paise = Math.round(Number(cleaned) * 100);
  return paise >= 0 ? paise : null;
}

export const rupeesInput = (paise: number | null): string => paise === null ? "" : String(paise / 100);
