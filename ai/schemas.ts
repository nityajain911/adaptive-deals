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

export const ExplanationOutputSchema = z
  .object({
    ranking: z.array(z.string().min(1).max(4)).min(1).max(12).describe("Option aliases, best first"),
    comparison: z.string().min(10).max(1200).describe("Trade-offs, using only {placeholders} for figures and dates"),
    option_notes: z
      .array(z.object({ option: z.string().min(1).max(4), note: z.string().min(5).max(240) }).strict())
      .max(12),
  })
  .strict();
export type ExplanationOutput = z.infer<typeof ExplanationOutputSchema>;

export const TASK_SCHEMAS = {
  extract: ExtractionOutputSchema,
  clarify: ClarificationOutputSchema,
  explain: ExplanationOutputSchema,
} as const;
export type AiTask = keyof typeof TASK_SCHEMAS;
export type TaskOutput<T extends AiTask> = z.infer<(typeof TASK_SCHEMAS)[T]>;
