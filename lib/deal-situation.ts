import type { FieldCard } from "@/ai/run-record";
import { DEMO_ANCHOR } from "@/domain/clock";

export type SituationTone = "red" | "amber" | "green" | "neutral";
export interface SituationTile {
  id: "budget" | "timeline" | "scope" | "approval";
  heading: string;
  /** The plain verdict, worked out by code from the verified values. */
  value: string;
  detail: string | null;
  tone: SituationTone;
  /** The buyer's own words the value was read from, verbatim. */
  quote: string | null;
}

const card = (profile: FieldCard[], key: string) => profile.find((item) => item.key === key && item.status !== "missing") ?? null;
const rupeesIn = (text: string | null): number | null => {
  const found = text?.match(/₹\s?([\d,]+(?:\.\d+)?)/);
  return found ? Number(found[1]!.replace(/,/g, "")) : null;
};
const firstQuote = (item: FieldCard | null) => item?.evidence[0]?.quote ?? null;
const DAY = 86_400_000;

/**
 * What stands between this buyer and the quote, as a few scannable facts. Every value comes from the verified profile
 * of the run (a value only appears if its quote was found in the buyer's messages) and every verdict is plain arithmetic
 * or a plain rule here: no model is asked, and nothing is inferred from tone. What the buyer did not state says so.
 */
export function dealSituation(args: { quotePrePaise: number; profile: FieldCard[]; rejectedFields: { key: string; rawText?: string | null }[]; packageNames: Record<string, string>; anchor?: string }): SituationTile[] {
  const { profile, packageNames } = args;
  const quoteRupees = args.quotePrePaise / 100;
  const tiles: SituationTile[] = [];

  const budget = card(profile, "budgetNow");
  const next = card(profile, "nextBudget");
  const nextWhen = next?.display?.match(/from (.+?) \(/)?.[1] ?? null;
  const amount = rupeesIn(budget?.display ?? null);
  if (budget && amount !== null) {
    const short = amount < quoteRupees;
    tiles.push({
      id: "budget",
      heading: "Budget",
      value: short ? "Short of your quote" : "Covers your quote",
      detail: `₹${amount.toLocaleString("en-IN")} available now${nextWhen ? ` · more from ${nextWhen}` : ""}`,
      tone: short ? "red" : "green",
      quote: firstQuote(budget),
    });
  } else tiles.push({ id: "budget", heading: "Budget", value: "Not stated", detail: nextWhen ? `More from ${nextWhen}` : null, tone: "neutral", quote: null });

  const start = card(profile, "latestStart");
  const startText = start?.display?.replace(/^Start by /, "") ?? null;
  if (start && startText) {
    const when = Date.parse(startText);
    const days = Number.isNaN(when) ? null : Math.round((when - Date.parse(args.anchor ?? DEMO_ANCHOR)) / DAY);
    const urgent = days !== null && days <= 31;
    tiles.push({ id: "timeline", heading: "Timeline", value: urgent ? "Needs a fast start" : "Start can wait a while", detail: `Start by ${startText}`, tone: urgent ? "red" : "amber", quote: firstQuote(start) });
  } else tiles.push({ id: "timeline", heading: "Timeline", value: "No start date stated", detail: null, tone: "neutral", quote: null });

  const required = card(profile, "requiredPackages");
  const optional = card(profile, "optionalPackages");
  const unmapped = args.rejectedFields.find((field) => field.key === "required_package");
  const names = (ids: string | null) => (ids ? ids.split(",").map((id) => packageNames[id.trim()] ?? id.trim()).join(", ") : null);
  if (unmapped) {
    tiles.push({ id: "scope", heading: "Scope", value: "Services to confirm", detail: unmapped.rawText ? `They said “${unmapped.rawText}” without naming services` : "They did not name the services", tone: "amber", quote: null });
  } else if (required) {
    const extra = names(optional?.display ?? null);
    tiles.push({ id: "scope", heading: "Scope", value: names(required.display) ?? "Stated", detail: extra ? `${extra} can wait` : null, tone: "neutral", quote: firstQuote(required) });
  } else tiles.push({ id: "scope", heading: "Scope", value: "Not stated", detail: null, tone: "neutral", quote: null });

  const approval = card(profile, "approvalLimit");
  if (approval?.display) tiles.push({ id: "approval", heading: "Approval", value: approval.display, detail: null, tone: "neutral", quote: firstQuote(approval) });
  return tiles;
}
