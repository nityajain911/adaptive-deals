import { z } from "zod";
import { EXTRACTION_FIELD_KEYS } from "@/domain/constraints";

/**
 * Strict schemas for every model output. Deliberately contain NO numeric fields: the model
 * returns raw text, evidence and choices only. Money, dates, schedules and feasibility are
 * computed by domain code. Every object is strict (unknown keys are a schema failure).
 */

export const CONFIDENCE = z.enum(["high", "medium", "low"]);

export const ExtractedFieldSchema = z
  .object({
    key: z.enum(EXTRACTION_FIELD_KEYS),
    raw_text: z.string().min(1).max(200).describe("The exact words from the message that state this value"),
    evidence_quote: z.string().min(1).max(400).describe("A verbatim substring of the cited message that contains raw_text"),
    message_id: z.string().min(1).max(64),
    confidence: CONFIDENCE,
  })
  .strict();

export const AMBIGUITY_FIELD_KEYS = ["amounts_include_gst", "approval_limit_scope", "next_budget_date", "budget_now_period", "other"] as const;

export const ExtractionOutputSchema = z
  .object({
    fields: z.array(ExtractedFieldSchema).max(40),
    ambiguities: z
      .array(z.object({ field_key: z.enum(AMBIGUITY_FIELD_KEYS), reason: z.string().min(1).max(300) }).strict())
      .max(10),
    missing_required: z.array(z.enum(["budget_now_amount", "budget_now_period"])).max(4),
    unsupported_requests: z
      .array(
        z
          .object({
            raw_text: z.string().min(1).max(200),
            evidence_quote: z.string().min(1).max(400),
            message_id: z.string().min(1).max(64),
            kind: z.enum(["split_payment", "phased_scope", "deferred_start", "shorter_commitment", "discount", "revenue_share", "barter_or_equity", "foreign_currency", "credit_or_loan", "scope_change_pricing", "other"]),
          })
          .strict(),
      )
      .max(10),
    suspected_instructions: z
      .array(z.object({ quote: z.string().min(1).max(400), message_id: z.string().min(1).max(64) }).strict())
      .max(10),
  })
  .strict();
export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;

export const ClarificationOutputSchema = z
  .object({
    questions: z
      .array(
        z
          .object({
            field: z.enum(["amountsIncludeGst", "approvalScope", "nextBudget"]),
            question: z.string().min(5).max(200),
          })
          .strict(),
      )
      .min(1)
      .max(3),
  })
  .strict();
export type ClarificationOutput = z.infer<typeof ClarificationOutputSchema>;

/** A bare option alias. Structured identifier fields accept only these, never labels or braces. */
export const OPTION_ALIASES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;
export const AliasSchema = z.enum(OPTION_ALIASES);

/**
 * Explanation schema used with explain.v1 and explain.v2. Kept unchanged so runs produced with
 * those prompts are validated, and therefore replayed, exactly as they were.
 */
export const ExplanationOutputSchemaV1 = z
  .object({
    ranking: z.array(z.string().min(1).max(4)).min(1).max(12).describe("Option aliases, best first"),
    comparison: z.string().min(10).max(1200).describe("Trade-offs, using only {placeholders} for figures and dates"),
    option_notes: z
      .array(z.object({ option: z.string().min(1).max(4), note: z.string().min(5).max(240) }).strict())
      .max(12),
  })
  .strict();

/** Explanation schema from explain.v3: identifier fields are bare aliases (A–L) only. */
export const ExplanationOutputSchema = z
  .object({
    ranking: z.array(AliasSchema).min(1).max(12).describe("Bare option aliases, best first, e.g. [\"B\", \"A\", \"C\"]"),
    comparison: z.string().min(10).max(1200).describe("Prose; names and figures only through {placeholders}"),
    option_notes: z
      .array(z.object({ option: AliasSchema.describe("Bare option alias, e.g. \"A\""), note: z.string().min(5).max(240).describe("Prose; figures only through {placeholders}") }).strict())
      .max(12),
  })
  .strict();

/** The explanation schema that belongs to a prompt version. */
export function explanationSchemaFor(promptVersion: string) {
  return promptVersion === "explain.v1" || promptVersion === "explain.v2" ? ExplanationOutputSchemaV1 : ExplanationOutputSchema;
}
export type ExplanationOutput = z.infer<typeof ExplanationOutputSchema>;

/**
 * What a model proposes after reading a merchant's rate card or cost sheet. Like every other schema it holds no
 * number: the amount is the document's own words, and code reads the figure out of the verified quote.
 */
export const DocumentReadingSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            service_id: z.string().min(1).max(64).describe("The id of one of the merchant's listed services"),
            document_name: z.string().min(1).max(120).describe("The words the document uses for that service"),
            amount_text: z.string().min(1).max(60).describe("The amount exactly as the document writes it, e.g. Rs 26,000"),
            evidence_quote: z.string().min(1).max(400).describe("A verbatim copy of the document text that contains both the service wording and the amount"),
          })
          .strict(),
      )
      .max(40),
    unreadable_lines: z
      .array(z.object({ quote: z.string().min(1).max(300), reason: z.string().min(1).max(200) }).strict())
      .max(20),
    suspected_instructions: z.array(z.object({ quote: z.string().min(1).max(400) }).strict()).max(10),
  })
  .strict();
export type DocumentReading = z.infer<typeof DocumentReadingSchema>;

/**
 * What a model proposes after reading a buyer's reply to a payment notice that code's own rules could not read, such as
 * "20 tak cash tight hai". Words only, no numbers as numbers: code finds the quote in the reply, resolves the date and checks it.
 */
export const PaymentReplyReadingSchema = z
  .object({
    phrase: z.string().min(1).max(80).describe("Words copied exactly from the reply that state the date"),
    day_text: z.string().min(1).max(12).describe("The day of the month exactly as the reply writes it, e.g. 20 or 20th"),
    month_text: z.string().min(1).max(20).nullable().describe("The month exactly as the reply writes it, only if it names one; otherwise null"),
    direction: z.enum(["until", "after", "from", "unclear"]).describe("until/after: cash is unavailable through that day; from: cash is available from that day; unclear if the reply does not say"),
  })
  .strict();
export type PaymentReplyReading = z.infer<typeof PaymentReplyReadingSchema>;

export const TASK_SCHEMAS = {
  extract: ExtractionOutputSchema,
  clarify: ClarificationOutputSchema,
  explain: ExplanationOutputSchema,
  read_document: DocumentReadingSchema,
  read_reply: PaymentReplyReadingSchema,
} as const;
export type AiTask = keyof typeof TASK_SCHEMAS;
export type TaskOutput<T extends AiTask> = z.infer<(typeof TASK_SCHEMAS)[T]>;
