import type { MessageInput } from "./schema";

export type MessageReason =
  | "unknown_slot"
  | "offer_total_missing"
  | "contains_figure"
  | "contains_date_word"
  | "leaks_internal"
  | "pressure_or_urgency"
  | "guarantee_or_promise"
  | "approval_bypass"
  | "invented_term"
  | "too_long"
  | "markdown_or_link";

export const TOKEN = /\{\{\s*([A-L])\.([a-z_]+)\s*\}\}/g;
const ANY_BRACES = /\{\{|\}\}/;

const FIGURE: RegExp[] = [
  /[0-9]/,
  /[₹$€£%]/,
  /\b(rs|inr|rupee\w*|dollar\w*|percent\w*|lakh\w*|crore\w*|thousand\w*|hundred\w*)\b/i,
  /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|half|double|twice|once)\b/i,
];
const DATE_WORDS = /\b(january|february|march|april|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|yesterday|week|weeks|month|months|quarter|year|years|day|days)\b/i;
// "may" is also a verb, so it counts as a month only after a preposition or "next/this/last".
const MAY_MONTH = /\b(?:in|by|from|until|till|during|after|before|on|since|next|this|last|every)\s+may\b/i;
const LEAKS = /\b(cost|costs|margin|margins|floor|guardrail\w*|limit|limits|minimum|lowest|bottom line|threshold\w*|internal|policy|policies|contribution|profit\w*|cash|budget)\b/i;
const PRESSURE = /\b(urgent\w*|hurry|today|tonight|now|expire\w*|last chance|deadline|before it|act fast|limited|slots?|spots?|left|scarce\w*|run out|rush)\b/i;
const GUARANTEE = /\b(guarantee\w*|promise\w*|assure\w*|definitely|certain\w*|no increase|will rank|will double|ensure results)\b/i;
const BYPASS = /\b(bypass\w*|skip\w*|no need for\b[^.]*\bapproval|without\b[^.]*\bapproval|approval is not needed|waive\w*)\b/i;
const INVENTED = /\b(discount\w*|free|complimentary|bonus|refund\w*|cashback|extra|referral|refer|gst|tax\w*|offer expires)\b/i;

export const MAX_MESSAGE_CHARS = 700;

/** The template with every {{X.slot}} token removed, which is all the model itself wrote. */
export const connectiveText = (template: string): string => template.replace(TOKEN, " ");

/**
 * A filter, not a guarantee (spec 11.5): it rejects what it can see. Anything it lets through is still
 * edited and approved by the merchant before anything is sent. Never throws.
 */
export function validateMessage(input: MessageInput, template: string): { accepted: boolean; reasons: MessageReason[] } {
  const reasons = new Set<MessageReason>();
  const allowed = new Map(input.offers.map((o) => [o.alias, new Set<string>(o.slots)]));
  const used = new Set<string>();

  for (const m of template.matchAll(TOKEN)) {
    if (!allowed.get(m[1]!)?.has(m[2]!)) reasons.add("unknown_slot");
    else used.add(`${m[1]}.${m[2]}`);
  }
  if (ANY_BRACES.test(connectiveText(template))) reasons.add("unknown_slot");
  for (const o of input.offers) if (o.slots.includes("total") && !used.has(`${o.alias}.total`)) reasons.add("offer_total_missing");

  const text = connectiveText(template);
  if (template.length > MAX_MESSAGE_CHARS) reasons.add("too_long");
  if (FIGURE.some((p) => p.test(text))) reasons.add("contains_figure");
  if (DATE_WORDS.test(text) || MAY_MONTH.test(text)) reasons.add("contains_date_word");
  if (LEAKS.test(text)) reasons.add("leaks_internal");
  if (PRESSURE.test(text)) reasons.add("pressure_or_urgency");
  if (GUARANTEE.test(text)) reasons.add("guarantee_or_promise");
  if (BYPASS.test(text)) reasons.add("approval_bypass");
  if (INVENTED.test(text) && !input.offers.some((o) => (o.slots as string[]).includes("discount"))) reasons.add("invented_term");
  if (/[*_`#>|]|https?:\/\/|www\./i.test(text)) reasons.add("markdown_or_link");
  return { accepted: reasons.size === 0, reasons: [...reasons] };
}
