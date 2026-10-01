/**
 * SYNTHETIC AI OUTPUTS for the hero deal, written by hand in the exact schema the model must
 * return. They power the credential-free "Synthetic replay". They are NOT output from a model.
 * They contain raw text, evidence and wording only — no computed figures.
 */
import type { ClarificationOutput, ExplanationOutput, ExtractionOutput } from "@/ai/schemas";
import { heroClarificationAnswers as A } from "./hero";

export const heroSyntheticExtractionOutput: ExtractionOutput = {
  fields: [
    { key: "budget_now_amount", raw_text: "₹50K", evidence_quote: "Only ₹50K left this quarter", message_id: "msg-2", confidence: "high" },
    { key: "budget_now_period", raw_text: "this quarter", evidence_quote: "Only ₹50K left this quarter", message_id: "msg-2", confidence: "high" },
    { key: "next_budget_date", raw_text: "April", evidence_quote: "new budget in April", message_id: "msg-2", confidence: "high" },
    { key: "approval_limit_amount", raw_text: "₹60K", evidence_quote: "anything above ₹60K needs MD approval", message_id: "msg-2", confidence: "high" },
  ],
  ambiguities: [
    { field_key: "amounts_include_gst", reason: "₹50K and ₹60K are stated without saying whether GST is included" },
    { field_key: "approval_limit_scope", reason: "“anything above ₹60K” could mean any single payment or the whole contract" },
  ],
  missing_required: [],
  unsupported_requests: [],
  suspected_instructions: [],
};

export const heroSyntheticClarificationOutput: ClarificationOutput = {
  questions: [
    { field: "amountsIncludeGst", question: A.gst.question },
    { field: "approvalScope", question: A.approvalScope.question },
  ],
};

/** Aliases follow the engine's baseline order (A, B within limit; C, D need MD approval). */
export const heroSyntheticExplanationOutput: ExplanationOutput = {
  ranking: ["A", "B", "C", "D"],
  comparison:
    "Option A ({A.label}) and option B ({B.label}) cover the same scope for {A.total}, inside the current-quarter budget and within the buyer's approval limit. A spreads it over payments on {A.payment_1.date} and {A.payment_2.date}; B collects {B.total} at the start, so the seller carries no unpaid service value. This smaller scope has value on its own and is its own purchase; any later scope would be a new decision under the buyer's normal approval. Option C ({C.label}) and option D ({D.label}) deliver the full annual scope and need the buyer's MD approval: C starts on {C.start_date} with {C.payment_1.total} now and {C.payment_2.total} on {C.payment_2.date}; D starts on {D.start_date} with {D.payment_count} monthly payments of {D.largest_payment}.",
  option_notes: [
    { option: "A", note: "Smaller payments for the buyer; peak funding requirement {A.peak_funding}." },
    { option: "B", note: "Simplest collection: one payment link, no mandate needed." },
    { option: "C", note: "Full scope from the start; needs the buyer's MD approval before it can be accepted." },
    { option: "D", note: "Full scope but starts later; needs the buyer's MD approval." },
  ],
};

export const SYNTHETIC_RUN_ID = "run-synthetic-hero-0001";
