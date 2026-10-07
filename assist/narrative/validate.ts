import { ALWAYS_BANNED, COMPARATIVE, EXTREMUM_FACTS, FIGURE, MAX_SENTENCE_CHARS, NEEDS_APPROVAL, TIE_WORDS, TOPICS, WITHIN_APPROVAL } from "./vocabulary";
import type { NarrativeInput, NarrativeOutput } from "./schema";

export type RejectReason =
  | "missing_alias"
  | "duplicate_alias"
  | "unknown_alias"
  | "uncited_fact"
  | "fact_not_true_for_offer"
  | "not_one_sentence"
  | "too_long"
  | "contains_figure"
  | "banned_wording"
  | "topic_without_fact"
  | "comparative_without_extremum_fact"
  | "tie_not_stated"
  | "approval_claim_mismatch";

export interface OfferVerdict {
  alias: string;
  accepted: boolean;
  sentence: string | null;
  reasons: RejectReason[];
}

/** Whether the sentence is one sentence: no line breaks or markdown, and one terminal stop at the end. */
function oneSentence(text: string): boolean {
  if (/[\n\r]|[*_`#>|]/.test(text)) return false;
  const body = text.trim().replace(/[.!?]$/, "");
  return !/[.!?]/.test(body) && /[.!?]$/.test(text.trim());
}

/**
 * Judge each offer's sentence against the facts code established for that offer. An offer whose sentence
 * fails keeps the code explanation; the others may use theirs. Never throws on model output.
 */
export function validateNarrative(input: NarrativeInput, output: NarrativeOutput): OfferVerdict[] {
  const seen = new Set<string>();
  const byAlias = new Map<string, NarrativeOutput["offers"][number]>();
  const extra: OfferVerdict[] = [];
  for (const item of output.offers) {
    if (!input.offers.some((o) => o.alias === item.alias)) extra.push({ alias: item.alias, accepted: false, sentence: null, reasons: ["unknown_alias"] });
    else if (seen.has(item.alias)) extra.push({ alias: item.alias, accepted: false, sentence: null, reasons: ["duplicate_alias"] });
    else byAlias.set(item.alias, item);
    seen.add(item.alias);
  }
  const verdicts = input.offers.map((offer): OfferVerdict => {
    const item = byAlias.get(offer.alias);
    if (!item) return { alias: offer.alias, accepted: false, sentence: null, reasons: ["missing_alias"] };
    const reasons = new Set<RejectReason>();
    const sentence = item.sentence.trim();
    const cited = new Set(item.fact_ids);
    const truth = new Set(offer.factIds);

    for (const id of cited) if (!truth.has(id)) reasons.add("fact_not_true_for_offer");
    if (!oneSentence(sentence)) reasons.add("not_one_sentence");
    if (sentence.length > MAX_SENTENCE_CHARS) reasons.add("too_long");
    if (FIGURE.some((p) => p.test(sentence))) reasons.add("contains_figure");
    if (ALWAYS_BANNED.some((p) => p.test(sentence))) reasons.add("banned_wording");

    // Only facts that are true for this offer can justify wording; the rest were already rejected above.
    const usable = new Set([...cited].filter((id) => truth.has(id)));
    for (const topic of TOPICS) if (topic.words.test(sentence) && !topic.facts.some((f) => usable.has(f))) reasons.add("topic_without_fact");
    if (COMPARATIVE.test(sentence)) {
      const extremum = [...usable].filter((id) => EXTREMUM_FACTS.includes(id));
      if (!extremum.length) reasons.add("comparative_without_extremum_fact");
      // A tied extremum, cited or not, must be described as a tie and never as a sole claim.
      else if (extremum.some((id) => truth.has(`tied_on:${tieKey(id)}`)) && !TIE_WORDS.test(sentence)) reasons.add("tie_not_stated");
    }
    if (NEEDS_APPROVAL.test(sentence) && !usable.has("needs_buyer_approval")) reasons.add("approval_claim_mismatch");
    if (WITHIN_APPROVAL.test(sentence) && !usable.has("within_buyer_approval")) reasons.add("approval_claim_mismatch");
    return { alias: offer.alias, accepted: reasons.size === 0, sentence: reasons.size === 0 ? sentence : null, reasons: [...reasons] };
  });
  return [...verdicts, ...extra];
}

/** The tie fact that goes with each extremum fact (domain/strategy.ts `addExtremum`). */
function tieKey(fact: string): string {
  return { highest_contribution: "contribution", lowest_cash_exposure: "cash_exposure", most_scope_retained: "scope_retained", smallest_largest_payment: "largest_payment", lowest_total: "total", earliest_start: "start", lowest_discount: "discount" }[fact] ?? "";
}
