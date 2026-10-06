import type { z } from "zod";

/**
 * What counts as a technically valid model result when recording case runs, and when a step may
 * be requested again. Pure so the rules are tested; the recording script applies them.
 *
 * A step is technically valid only if the provider returned output that meets the declared output
 * schema. Well-formed JSON alone is not enough: the schema is the output contract. Prose rules
 * (no literal figures, no approval-bypass wording) are not part of this contract; they belong to
 * the product's validator, which keeps the code fallback without another request. A refusal is a
 * genuine model outcome and is never requested again.
 */
export const RETRY_BUDGET = { schema: 1, provider: 4 } as const;

const TECHNICAL = new Set(["unavailable", "api_error", "truncated", "schema_invalid"]);

export type OutputContract = { valid: true } | { valid: false; reason: string };

/** Application-level schema check of one provider output against the request's declared schema. */
export function outputContract(schema: z.ZodType, raw: unknown): OutputContract {
  const parsed = schema.safeParse(raw);
  return parsed.success ? { valid: true } : { valid: false, reason: `schema: ${parsed.error.issues[0]?.message ?? "invalid"}` };
}

export type AttemptResult = { ok: true; raw: unknown } | { ok: false; failure: string };
export type Spent = { schemaRetries: number; providerRetries: number };
export type Decision =
  | { action: "keep" }
  | { action: "retry"; why: "schema" | "provider"; /** Keep this attempt's output in the report. */ preserve: boolean; /** "pace" waits the normal interval; "provider" waits the provider's stated retry time. */ waitFor: "pace" | "provider" }
  | { action: "stop"; reason: string };

export function decideAfterAttempt(result: AttemptResult, contract: OutputContract, spent: Spent): Decision {
  if (result.ok) {
    if (contract.valid) return { action: "keep" };
    if (spent.schemaRetries >= RETRY_BUDGET.schema) return { action: "stop", reason: `The output still fails its schema after ${RETRY_BUDGET.schema} rerun: ${contract.reason}` };
    return { action: "retry", why: "schema", preserve: true, waitFor: "pace" };
  }
  if (result.failure === "refusal") return { action: "stop", reason: "The model refused. A refusal is a valid outcome and is not requested again." };
  if (!TECHNICAL.has(result.failure)) return { action: "stop", reason: `Not a retryable failure: ${result.failure}` };
  if (spent.providerRetries >= RETRY_BUDGET.provider) return { action: "stop", reason: `Provider failure persists after ${RETRY_BUDGET.provider} retries: ${result.failure}` };
  return { action: "retry", why: "provider", preserve: false, waitFor: "provider" };
}
