import type { AgreementVersion } from "@/domain/agreement";
import type { Amendment } from "@/domain/amendment";
import { formatINR } from "@/domain/money";
import type { CounterOffer, SelectedOption } from "@/lib/deal-records";

/** The parts of a deal that are recorded as learning evidence. Every line below is read from them, never written by hand. */
export interface LearningInputs {
  selectedOption: Pick<SelectedOption, "explicit"> | null;
  counterOffers: Pick<CounterOffer, "override">[];
  economics: { overrides: unknown[] };
  agreements: Pick<AgreementVersion, "status">[];
  amendments: Pick<Amendment, "state">[];
  changeRequests: { state: string }[];
  collectedPaise: number;
}

export interface LearningEvidence {
  /** One line for this deal, in the order they happened. */
  recorded: string;
  /** What the product did with it. */
  decision: string;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * What this deal taught the product to remember: the suggested offer followed or changed, any pricing
 * exception, the buyer's decision, payment-date changes and money collected. It proposes nothing: with
 * a single deal there is no evidence to change a recommendation, and the merchant's rules never move
 * without the merchant approving a new version.
 */
export function learningEvidence(i: LearningInputs): LearningEvidence {
  const parts: string[] = [];
  if (i.selectedOption) parts.push(i.selectedOption.explicit ? "you chose a different offer from the suggested one" : "suggested offer followed");
  const exceptions = i.economics.overrides.length + i.counterOffers.filter((c) => c.override).length;
  parts.push(exceptions === 0 ? "no pricing exception" : `${exceptions} pricing ${plural(exceptions, "exception", "exceptions")}`);
  if (i.agreements.some((a) => a.status === "buyer_rejected")) parts.push("buyer declined");
  else if (i.agreements.some((a) => a.status === "accepted" || a.status === "active")) parts.push("buyer accepted");
  const asked = i.changeRequests.length;
  if (asked) parts.push(`${asked} ${plural(asked, "change request", "change requests")}`);
  const moved = i.amendments.filter((a) => a.state === "active").length;
  if (moved) parts.push(`${moved} payment-date ${plural(moved, "change", "changes")}`);
  if (i.collectedPaise > 0) parts.push(`${formatINR(i.collectedPaise)} collected`);
  const text = parts.join(" · ");
  return {
    recorded: text.charAt(0).toUpperCase() + text.slice(1),
    decision: "No policy change proposed. One deal is not enough evidence, so this is recorded for evaluation and does not change your prices, limits or future offers.",
  };
}

export const LEARNING_PATH = [
  "Outcome recorded",
  "Evidence builds up across deals",
  "A possible change is tested",
  "You approve it",
  "It starts as a new version",
] as const;
