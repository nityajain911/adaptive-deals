import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicProvider } from "@/ai/anthropic-provider";
import { buildExtractionRequest } from "@/ai/extract";
import { heroMessages, heroPackages } from "@/data/synthetic/hero";
import { heroOutputs, heroRun, ScriptedProvider } from "./helpers";

describe("invalid, unavailable or schema-breaking output degrades to review", () => {
  it.each(["unavailable", "not_configured", "refusal", "truncated", "schema_invalid", "api_error"] as const)("extraction %s → needs review, no commercial terms", async (fail) => {
    const run = await heroRun(new ScriptedProvider({ extract: { fail } }));
    expect(run.record.status).toBe("needs_review");
    expect(run.record.steps[0]).toMatchObject({ outcome: "failed", failure: { kind: fail } });
    expect(run.evaluation.state).toBe("insufficient_information");
    expect(run.evaluation.result).toBeNull();
    expect(run.explanation).toBeNull();
  });

  it("schema-breaking output (extra keys, wrong types) is rejected whole", async () => {
    const broken = { ...heroOutputs().extract, fields: "₹50K", override_policy: true };
    const run = await heroRun(new ScriptedProvider({ extract: broken }));
    expect(run.record.status).toBe("needs_review");
    expect(run.record.steps[0].outcome).toBe("rejected");
    expect(run.record.steps[0].rawOutput).toEqual(broken); // kept for audit
    expect(run.profile.budgetNow.status).toBe("missing");
  });

  it("clarification wording failure falls back to code wording; the questions are unchanged in substance", async () => {
    const out = heroOutputs();
    const run = await heroRun(new ScriptedProvider({ extract: out.extract, clarify: { fail: "unavailable" } }));
    expect(run.evaluation.state).toBe("ambiguous");
    expect(run.questions.map((q) => [q.field, q.wording, q.question])).toEqual([
      ["amountsIncludeGst", "code_fallback", "Do both ₹50,000 and ₹60,000 include GST?"],
      ["approvalScope", "code_fallback", "Is ₹60,000 the limit per payment or for the full contract?"],
    ]);
  });

  it("explanation failure keeps every feasible option, ranked by code, with a code comparison", async () => {
    const out = heroOutputs();
    const run = await heroRun(new ScriptedProvider({ extract: out.extract, clarify: out.clarify, explain: { fail: "schema_invalid" } }), { answers: true });
    expect(run.evaluation.state).toBe("options_ready");
    expect(run.explanation!.source).toEqual({ ranking: "code", text: "code_fallback" });
    expect(run.explanation!.order).toEqual(run.evaluation.result!.feasible.map((x) => x.structure.id));
  });

  it("Anthropic provider maps SDK outcomes to safe failures", async () => {
    const req = buildExtractionRequest(heroMessages, heroPackages);
    const fake = (impl: () => unknown) => ({ messages: { parse: async () => impl() } }) as unknown as Anthropic;
    const base = { model: "claude-opus-5", usage: { input_tokens: 1, output_tokens: 1 }, content: [] };
    const refusal = await new AnthropicProvider("claude-opus-5", fake(() => ({ ...base, stop_reason: "refusal", parsed_output: null }))).generate(req);
    expect(refusal).toMatchObject({ ok: false, failure: "refusal" });
    const truncated = await new AnthropicProvider("claude-opus-5", fake(() => ({ ...base, stop_reason: "max_tokens", parsed_output: null }))).generate(req);
    expect(truncated).toMatchObject({ ok: false, failure: "truncated" });
    const unparsed = await new AnthropicProvider("claude-opus-5", fake(() => ({ ...base, stop_reason: "end_turn", parsed_output: null }))).generate(req);
    expect(unparsed).toMatchObject({ ok: false, failure: "schema_invalid" });
    const down = await new AnthropicProvider("claude-opus-5", fake(() => { throw Object.create(Anthropic.APIConnectionError.prototype); })).generate(req);
    expect(down).toMatchObject({ ok: false, failure: "unavailable" });
    const ok = await new AnthropicProvider("claude-opus-5", fake(() => ({ ...base, stop_reason: "end_turn", parsed_output: heroOutputs().extract }))).generate(req);
    expect(ok).toMatchObject({ ok: true, meta: { provider: "anthropic", model: "claude-opus-5", temperature: "not sent: unsupported by model" } });
  });
});
