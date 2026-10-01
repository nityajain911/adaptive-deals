import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ExtractionOutputSchema } from "@/ai/schemas";

/**
 * Evaluation case format, shared by the development set and the frozen test set.
 * Development cases may include `referenceExtraction` (a hand-written expected model output used
 * to check labels and code). Frozen cases must not: they are labelled independently and scored
 * only against live model output.
 */
const DateValueSchema = z.object({ value: z.string(), precision: z.enum(["day", "month"]) }).strict();

export const GoldFieldsSchema = z
  .object({
    budgetNow: z.object({ amountPaise: z.number().int(), period: z.object({ start: z.string(), end: z.string() }).strict() }).strict().nullable(),
    nextBudget: DateValueSchema.nullable(),
    approvalLimitPaise: z.number().int().nullable(),
    approvalScope: z.enum(["per_payment", "per_contract"]).nullable(),
    amountsIncludeGst: z.enum(["yes", "no"]).nullable(),
    latestStart: DateValueSchema.nullable(),
  })
  .strict();

export const FAILURE_STATES = ["ambiguous", "insufficient_information", "outside_templates", "no_feasible_deal", "options_ready"] as const;

export const EvalCaseSchema = z
  .object({
    id: z.string().regex(/^(dev|test)-[a-z0-9-]+$/),
    split: z.enum(["development", "frozen"]),
    synthetic: z.literal(true),
    language: z.enum(["english", "hinglish"]),
    tags: z.array(z.string()),
    seller: z.literal("hero"),
    messages: z
      .array(
        z
          .object({
            id: z.string(),
            author: z.enum(["buyer", "merchant"]),
            text: z.string().min(1),
            timestamp: z.string(),
            source: z.enum(["whatsapp", "email"]),
          })
          .strict(),
      )
      .min(1),
    gold: z
      .object({
        /** Expected normalised values after code normalisation; null = should not be extracted. */
        fields: GoldFieldsSchema,
        /** Facts that must be asked about (decision-relevant ambiguities). */
        requiredClarifications: z.array(z.enum(["amountsIncludeGst", "approvalScope", "nextBudget"])),
        /** Expected engine state before any clarification answer. */
        expectedState: z.enum(FAILURE_STATES),
        suspectedInstruction: z.boolean(),
        unsupportedKinds: z.array(z.string()),
      })
      .strict(),
    labelledBy: z.string().min(1),
    labelledAt: z.string().min(1),
    referenceExtraction: ExtractionOutputSchema.optional(),
    notes: z.string().optional(),
  })
  .strict();
export type EvalCase = z.infer<typeof EvalCaseSchema>;

export class DatasetError extends Error {}

export function loadDataset(dir: string, split: "development" | "frozen"): EvalCase[] {
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const cases = files.map((f) => {
    const parsed = EvalCaseSchema.safeParse(JSON.parse(readFileSync(path.join(dir, f), "utf8")));
    if (!parsed.success) throw new DatasetError(`${f}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    if (parsed.data.split !== split) throw new DatasetError(`${f}: split is ${parsed.data.split}, expected ${split}`);
    if (split === "frozen" && parsed.data.referenceExtraction) throw new DatasetError(`${f}: frozen cases must not include a reference extraction`);
    for (const m of parsed.data.messages) if (Number.isNaN(Date.parse(m.timestamp))) throw new DatasetError(`${f}: bad timestamp on ${m.id}`);
    return parsed.data;
  });
  const ids = new Set<string>();
  for (const c of cases) {
    if (ids.has(c.id)) throw new DatasetError(`duplicate case id ${c.id}`);
    ids.add(c.id);
  }
  return cases;
}

export const DATASET_DIRS = {
  development: path.join(process.cwd(), "evaluation/datasets/development"),
  frozen: path.join(process.cwd(), "evaluation/datasets/frozen"),
};
