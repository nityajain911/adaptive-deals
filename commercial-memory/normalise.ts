import { normaliseAmount } from "@/domain/amounts";

const SERVICE_ALIASES = [
  ["website fixes", ["website fixes", "website maintenance"]],
  ["search marketing", ["search marketing", "search ads", "paid search"]],
  ["social media", ["social media", "social marketing"]],
  ["monthly reporting", ["monthly reporting", "reporting"]],
] as const;

export const normaliseTokens = (text: string): string[] =>
  [...new Set(text.toLowerCase().replace(/[₹,]/g, " ").split(/[^a-z0-9]+/).filter((token) => token.length > 1))];

export function extractEntities(text: string): string[] {
  const lower = text.toLowerCase();
  return SERVICE_ALIASES.filter(([, aliases]) => aliases.some((alias) => lower.includes(alias))).map(([canonical]) => canonical);
}

const amountCandidates = (text: string): string[] => {
  const found: { start: number; text: string }[] = [];
  const patterns = [
    /₹\s*\d+(?:,\d{2,3})*(?:\.\d{1,2})?\s*(?:k|l|lac|lakh|cr|crore)?/gi,
    /\b\d{4,}(?:\.\d{1,2})?\b/g,
    /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakh|crore|and)(?:[ -]+(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakh|crore|and))+\b/gi,
  ];
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) found.push({ start: match.index!, text: match[0] });
  return found.sort((a, b) => a.start - b.start || b.text.length - a.text.length)
    .filter((item, index, all) => !all.slice(0, index).some((earlier) => item.start >= earlier.start && item.start + item.text.length <= earlier.start + earlier.text.length))
    .map((item) => item.text);
};

export function extractAmountsPaise(text: string): number[] {
  const amounts: number[] = [];
  for (const candidate of amountCandidates(text)) {
    const parsed = normaliseAmount(candidate);
    if (parsed.ok && !amounts.includes(parsed.paise)) amounts.push(parsed.paise);
  }
  return amounts;
}
