/**
 * The closed vocabulary that decides whether a sentence says only what its cited facts support. It is a
 * filter, not a proof: prose can still imply something none of these patterns detects, which is why the
 * code explanation is what the screen shows by default (spec 11.4).
 */

/** Words that make a claim no fact supports, or that cross a boundary the model must never cross. */
export const ALWAYS_BANNED: RegExp[] = [
  /\b(best|better|worse|worst|ideal|perfect|safest|safe|recommend\w*|should|must|only|unique\w*|guarantee\w*|promise\w*)\b/i,
  /\b(cost|costs|margin|margins|floor|guardrail\w*|profit\w*|limit|limits|threshold\w*|policy|policies)\b/i,
  /\b(urgent\w*|hurry|now|today|tonight|deadline|expire\w*|last chance|before it)\b/i,
  /\b(negotiat\w*|concession\w*|discount(ed)? price|lowest acceptable|walk away|bottom line)\b/i,
];

/** A figure of any kind: digits, currency, percentages, number words and magnitudes. */
export const FIGURE: RegExp[] = [
  /[0-9]/,
  /[₹$€£%]/,
  /\b(rs|inr|rupee\w*|dollar\w*|percent\w*|lakh\w*|crore\w*|million\w*|thousand\w*|hundred\w*)\b/i,
  /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|half|double|triple|twice)\b/i,
];

/** A fact family: the words that talk about a topic, and the facts that make talking about it true. */
export interface Topic {
  id: string;
  words: RegExp;
  facts: string[];
}

export const TOPICS: Topic[] = [
  { id: "money_kept", words: /\b(keep|keeps|kept|contribution|earn|earns|earnings|retains money)\b/i, facts: ["highest_contribution"] },
  { id: "cash", words: /\bcash\b/i, facts: ["lowest_cash_exposure"] },
  { id: "scope", words: /\b(scope|services|package|packages|included|everything|full)\b/i, facts: ["most_scope_retained"] },
  { id: "payment_size", words: /\b(payment|payments|instalment|instalments|installment|installments)\b/i, facts: ["smallest_largest_payment"] },
  { id: "total", words: /\b(total|price|priced|cheap|cheapest)\b/i, facts: ["lowest_total"] },
  { id: "start", words: /\b(start|starts|starting|begin|begins|soon|sooner)\b/i, facts: ["earliest_start"] },
  { id: "discount", words: /\bdiscount(s|ed)?\b/i, facts: ["no_discount", "lowest_discount"] },
  { id: "approval", words: /\b(approval|approve|approved|MD|sign-off)\b/i, facts: ["within_buyer_approval", "needs_buyer_approval"] },
];

/** Facts that are extremum claims ("the most", "the lowest"); the rest describe a property. */
export const EXTREMUM_FACTS = ["highest_contribution", "lowest_cash_exposure", "most_scope_retained", "smallest_largest_payment", "lowest_total", "earliest_start", "lowest_discount"];

/** A comparative or superlative: only an extremum fact can justify it. */
export const COMPARATIVE = /\b(most|least|highest|lowest|greatest|smallest|largest|biggest|fewest|earliest|soonest|cheapest|lower|higher|smaller|larger|earlier|fewer|more|less|top|maximum|minimum)\b/i;

/** A tie in a cited extremum must be stated as a tie, never as a sole claim. */
export const TIE_WORDS = /\b(tied|tie|ties|equal|equally|shares|shared|alongside|as much as|same as|matches|match)\b/i;

/** Which approval claim each wording makes. */
export const NEEDS_APPROVAL = /\b(needs|need|requires|require|requiring|subject to)\b[^.]*\b(approval|MD)\b|\b(approval|MD)\b[^.]*\b(needed|required)\b/i;
export const WITHIN_APPROVAL = /\bwithin\b[^.]*\b(approval|MD)\b|\bwithout\b[^.]*\b(approval|MD)\b|\bno\b[^.]*\b(approval|MD)\b/i;

export const MAX_SENTENCE_CHARS = 220;
