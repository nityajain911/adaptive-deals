import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ExplanationOutputSchema } from "@/ai/schemas";
import { decideAfterAttempt, outputContract, RETRY_BUDGET } from "@/scripts/recording-policy";

const ok = (raw: unknown) => ({ ok: true as const, raw });
const fail = (failure: string) => ({ ok: false as const, failure });

describe("recording policy: what counts as a technically valid result", () => {
  it("accepts well-formed output that meets the declared schema", () => {
    expect(outputContract(ExplanationOutputSchema, { ranking: ["A"], comparison: "Option A fits.", option_notes: [] })).toEqual({ valid: true });
  });

  it("treats well-formed JSON that breaks the schema as a schema failure, with the reason", () => {
    const tooLong = { ranking: ["A"], comparison: "Option A fits the buyer.", option_notes: [{ option: "A", note: "x".repeat(300) }] };
    const result = outputContract(ExplanationOutputSchema, tooLong);
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.reason).toMatch(/schema: .*<=\d+ characters/);
  });

  it("does not look at prose: a safety-rule violation is not a schema failure", () => {
    // Prose rules (literal figures, approval-bypass wording) belong to the product's validator, which keeps the code fallback.
    expect(outputContract(z.object({ comparison: z.string() }), { comparison: "A single payment of ₹46,020" })).toEqual({ valid: true });
  });
});

describe("recording policy: when a step is requested again", () => {
  const fresh = { schemaRetries: 0, providerRetries: 0 };

  it("keeps a schema-valid result as final", () => {
    expect(decideAfterAttempt(ok({}), { valid: true }, fresh)).toEqual({ action: "keep" });
  });

  it("requests a schema-invalid result again exactly once, preserving the rejected attempt", () => {
    expect(decideAfterAttempt(ok({ bad: 1 }), { valid: false, reason: "schema: too long" }, fresh)).toEqual({ action: "retry", why: "schema", preserve: true, waitFor: "pace" });
    expect(decideAfterAttempt(ok({ bad: 2 }), { valid: false, reason: "schema: too long" }, { schemaRetries: RETRY_BUDGET.schema, providerRetries: 0 })).toMatchObject({ action: "stop", reason: expect.stringMatching(/still fails its schema/) });
  });

  it.each(["unavailable", "api_error", "truncated", "schema_invalid"])("requests a provider-level %s failure again, after the provider's stated wait", (failure) => {
    expect(decideAfterAttempt(fail(failure), { valid: false, reason: "n/a" }, fresh)).toEqual({ action: "retry", why: "provider", preserve: false, waitFor: "provider" });
  });

  it("stops after the provider-failure budget is spent", () => {
    expect(decideAfterAttempt(fail("unavailable"), { valid: false, reason: "n/a" }, { schemaRetries: 0, providerRetries: RETRY_BUDGET.provider })).toMatchObject({ action: "stop" });
  });

  it("never requests a refusal again", () => {
    const decision = decideAfterAttempt(fail("refusal"), { valid: false, reason: "n/a" }, fresh);
    expect(decision).toMatchObject({ action: "stop", reason: expect.stringMatching(/refus/i) });
  });

  it("stops on a failure that is not technical", () => {
    expect(decideAfterAttempt(fail("not_configured"), { valid: false, reason: "n/a" }, fresh)).toMatchObject({ action: "stop" });
  });

  it("spends the schema budget separately from the provider budget", () => {
    expect(decideAfterAttempt(ok({}), { valid: false, reason: "schema" }, { schemaRetries: 0, providerRetries: RETRY_BUDGET.provider })).toMatchObject({ action: "retry", why: "schema" });
  });
});
