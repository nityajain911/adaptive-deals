import { normaliseAmount } from "@/domain/amounts";
import { statedAmountFields, type ClarifiableField } from "@/domain/constraints";
import { explainAmbiguity, readingLabel } from "@/domain/copy";
import { formatDateValue } from "@/domain/dates";
import type { AmbiguityImpact } from "@/domain/engine";
import { formatINR } from "@/domain/money";
import type { AmountField, ConstraintProfile } from "@/domain/types";
import { requestHash } from "./extract";
import { PROMPTS } from "./prompts";
import type { StructuredRequest } from "./provider";
import { ClarificationOutputSchema } from "./schemas";

export const CLARIFICATION_IDS: Record<ClarifiableField, string> = {
  amountsIncludeGst: "clar-gst",
  approvalScope: "clar-approval",
  nextBudget: "clar-next-budget",
};

export interface ClarificationQuestion {
  id: string;
  field: ClarifiableField;
  question: string;
  /** Engine-derived: how the readings change the options. Never written by the AI. */
  whyItMatters: string;
  wording: "ai" | "code_fallback";
  /** For the GST question: the stated amounts the question names (and an answer will cover). */
  covers: AmountField[];
}

export interface ClarificationResult {
  questions: ClarificationQuestion[];
  issues: string[];
}

const amountsOf = (p: ConstraintProfile): { field: AmountField; paise: number; display: string }[] =>
  statedAmountFields(p)
    .map((f) => {
      const paise = f === "budgetNow" ? p.budgetNow.value?.amountPaise : p.approvalLimit.value?.amountPaise;
      return paise == null ? null : { field: f, paise, display: formatINR(paise) };
    })
    .filter((x): x is { field: AmountField; paise: number; display: string } => x !== null);

/** Facts sent to the model: only decision-relevant ambiguities, with the engine's comparison. */
export function buildClarificationRequest(profile: ConstraintProfile, impacts: AmbiguityImpact[]): StructuredRequest {
  const prompt = PROMPTS.clarify;
  const amounts = amountsOf(profile);
  const facts = impacts
    .filter((a) => a.decisionRelevant)
    .map((a) => {
      const subject =
        a.field === "amountsIncludeGst"
          ? `Whether these amounts include GST: ${amounts.map((x) => x.display).join(" and ")}`
          : a.field === "approvalScope"
            ? `Whether the approval limit of ${formatINR(profile.approvalLimit.value!.amountPaise)} applies per payment or to the whole contract`
            : `Which month/day the next budget is available (${(profile.nextBudget.readings ?? []).map((r) => formatDateValue(r.available)).join(" or ")})`;
      return `- fact: ${a.field}\n  about: ${subject}\n  readings: ${a.readings.map(readingLabel).join(" | ")}\n  engine comparison: ${explainAmbiguity(a)}`;
    })
    .join("\n");
  const user = `Unresolved facts that change the deal options:\n${facts}\n\nWrite one question per fact.`;
  return { task: "clarify", prompt, user, schema: ClarificationOutputSchema, inputHash: requestHash(prompt.version, user) };
}

/** Code-authored question wording, used when model wording is missing or fails validation. */
export function fallbackQuestion(field: ClarifiableField, profile: ConstraintProfile): string {
  if (field === "amountsIncludeGst") {
    const a = amountsOf(profile).map((x) => x.display);
    return a.length > 1 ? `Do both ${a.slice(0, -1).join(", ")} and ${a.at(-1)} include GST?` : `Does ${a[0]} include GST?`;
  }
  if (field === "approvalScope") return `Is ${formatINR(profile.approvalLimit.value!.amountPaise)} the limit per payment or for the full contract?`;
  const r = (profile.nextBudget.readings ?? []).map((x) => formatDateValue(x.available));
  return `When you said the new budget arrives, did you mean ${r.join(" or ")}?`;
}

const AMOUNT_TOKEN = /(?:₹|rs\.?\s*|inr\s*)?\d[\d,]*(?:\.\d+)?\s*(?:k|lakh|lac|l|cr|crore)?\b/gi;

function validateQuestion(field: ClarifiableField, q: string, profile: ConstraintProfile): string | null {
  if (!q.trim().endsWith("?")) return "not a question";
  const allowed = new Set(amountsOf(profile).map((x) => x.paise));
  const years = new Set((profile.nextBudget.readings ?? []).map((r) => r.available.value.slice(0, 4)));
  const mentioned: number[] = [];
  for (const token of q.match(AMOUNT_TOKEN) ?? []) {
    const t = token.trim();
    if (field === "nextBudget" && years.has(t)) continue;
    const n = normaliseAmount(t);
    if (!n.ok || !allowed.has(n.paise)) return `uses a figure not in the buyer's message (${t})`;
    mentioned.push(n.paise);
  }
  if (field === "amountsIncludeGst") {
    const missing = amountsOf(profile).filter((a) => !mentioned.includes(a.paise));
    if (missing.length) return `GST question does not name ${missing.map((m) => m.display).join(", ")}`;
  }
  if (field === "approvalScope" && !mentioned.includes(profile.approvalLimit.value!.amountPaise)) return "does not name the approval limit";
  return null;
}

/**
 * Accept model wording only for decision-relevant facts and only when it passes validation.
 * Every decision-relevant fact gets exactly one question; code wording fills any gap.
 */
export function interpretClarification(raw: unknown | null, profile: ConstraintProfile, impacts: AmbiguityImpact[]): ClarificationResult {
  const relevant = impacts.filter((a) => a.decisionRelevant);
  const issues: string[] = [];
  const proposed = new Map<ClarifiableField, string>();
  if (raw !== null) {
    const parsed = ClarificationOutputSchema.safeParse(raw);
    if (!parsed.success) issues.push(`schema: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    else
      for (const q of parsed.data.questions) {
        if (!relevant.some((a) => a.field === q.field)) issues.push(`${q.field}: not decision-relevant; question dropped`);
        else if (proposed.has(q.field)) issues.push(`${q.field}: duplicate question dropped`);
        else {
          const problem = validateQuestion(q.field, q.question, profile);
          if (problem) issues.push(`${q.field}: ${problem}; code wording used`);
          else proposed.set(q.field, q.question.trim());
        }
      }
  }
  const covers = statedAmountFields(profile);
  return {
    issues,
    questions: relevant.map((a) => ({
      id: CLARIFICATION_IDS[a.field],
      field: a.field,
      question: proposed.get(a.field) ?? fallbackQuestion(a.field, profile),
      whyItMatters: explainAmbiguity(a),
      wording: proposed.has(a.field) ? "ai" : "code_fallback",
      covers: a.field === "amountsIncludeGst" ? covers : [],
    })),
  };
}
