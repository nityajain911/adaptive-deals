import { describe, expect, it } from "vitest";
import Groq from "groq-sdk";
import { AssistGroq, buildAssistGroqParams, type AssistGroqClient } from "@/assist/groq";
import { ASSIST_PROMPTS, promptHash } from "@/assist/prompts";
import { NarrativeOutputSchema, type NarrativeInput } from "@/assist/narrative/schema";
import { narrativeInputHash, narrativeUserContent, runNarrative } from "@/assist/narrative/run";

const INPUT: NarrativeInput = { strategy: "protect_contribution", offers: [{ alias: "A", factIds: ["highest_contribution", "within_buyer_approval"] }, { alias: "B", factIds: ["lowest_total", "needs_buyer_approval"] }] };
const reply = (content: string | null, finish = "stop") => ({ model: "m", choices: [{ finish_reason: finish, message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
const client = (fn: () => Promise<ReturnType<typeof reply>>): AssistGroqClient => ({ chat: { completions: { create: fn } } });
const provider = (fn: () => Promise<ReturnType<typeof reply>>) => new AssistGroq("test-model", client(fn));

describe("what is sent", () => {
  const params = buildAssistGroqParams({ model: "m", system: "S", user: "U", name: "n", schema: NarrativeOutputSchema });
  it("is strict JSON-schema output at temperature 0 with no tools", () => {
    expect(params).toMatchObject({ temperature: 0, response_format: { type: "json_schema", json_schema: { strict: true } } });
    expect(params).not.toHaveProperty("tools");
  });
  it("sends only aliases and fact IDs: no amount, cost or guardrail", () => {
    expect(narrativeUserContent(INPUT)).not.toMatch(/[0-9₹]|cost|floor|margin|guardrail/i);
    expect(ASSIST_PROMPTS.strategy_narrative.system).not.toMatch(/₹/);
  });
  it("has a stable hash that changes with the prompt text", () => {
    expect(promptHash(ASSIST_PROMPTS.strategy_narrative)).toBe(promptHash(ASSIST_PROMPTS.strategy_narrative));
    expect(promptHash({ ...ASSIST_PROMPTS.strategy_narrative, system: "different" })).not.toBe(promptHash(ASSIST_PROMPTS.strategy_narrative));
    expect(narrativeInputHash(INPUT)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("a call never blocks and never throws", () => {
  const good = JSON.stringify({ offers: [{ alias: "A", fact_ids: ["highest_contribution"], sentence: "It keeps the most for you." }, { alias: "B", fact_ids: ["lowest_total"], sentence: "It has the lowest total." }] });
  it("validates a good answer per offer", async () => {
    const run = await runNarrative(INPUT, provider(async () => reply(good)));
    expect(run.status).toBe("validated");
    expect(run.verdicts.map((v) => v.accepted)).toEqual([true, true]);
    expect(run.meta?.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });
  it("keeps the code explanation for an offer whose sentence fails, and the model's for the rest", async () => {
    const mixed = JSON.stringify({ offers: [{ alias: "A", fact_ids: ["highest_contribution"], sentence: "It is the best option." }, { alias: "B", fact_ids: ["lowest_total"], sentence: "It has the lowest total." }] });
    expect((await runNarrative(INPUT, provider(async () => reply(mixed)))).verdicts.map((v) => v.accepted)).toEqual([false, true]);
  });
  it.each([
    ["truncated output", () => reply("{", "length"), "truncated"],
    ["empty output", () => reply(null), "invalid_output"],
    ["output that is not JSON", () => reply("not json"), "invalid_output"],
    ["output that fails the schema", () => reply(JSON.stringify({ wrong: true })), "schema_rejected"],
  ] as const)("%s", async (_name, make, status) => {
    const run = await runNarrative(INPUT, provider(async () => make()));
    expect(run.status).toBe(status);
    expect(run.verdicts.every((v) => !v.accepted)).toBe(true);
  });
  it("maps provider errors to a failure status", async () => {
    const run = await runNarrative(INPUT, provider(async () => { throw new Groq.APIConnectionError({ cause: new Error("down") }); }));
    expect(run).toMatchObject({ status: "unavailable", meta: null });
    expect((await runNarrative(INPUT, provider(async () => { throw new Error("boom"); }))).status).toBe("api_error");
  });
});
