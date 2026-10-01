import { describe, expect, it } from "vitest";
import Groq from "groq-sdk";
import { buildGroqParams, GroqProvider } from "@/ai/groq-provider";
import { buildExtractionRequest } from "@/ai/extract";
import { toStrictJsonSchema } from "@/ai/strict-schema";
import { TASK_SCHEMAS } from "@/ai/schemas";
import { heroMessages, heroPackages } from "@/data/synthetic/hero";
import { heroOutputs } from "./helpers";

const req = buildExtractionRequest(heroMessages, heroPackages);

function walk(node: unknown, visit: (o: Record<string, unknown>) => void) {
  if (Array.isArray(node)) node.forEach((n) => walk(n, visit));
  else if (node && typeof node === "object") {
    visit(node as Record<string, unknown>);
    Object.values(node as Record<string, unknown>).forEach((v) => walk(v, visit));
  }
}

describe("Groq strict structured output", () => {
  it.each(Object.entries(TASK_SCHEMAS))("%s schema is strict-mode compatible: closed, fully required, basic keywords, no numbers", (_, schema) => {
    const js = toStrictJsonSchema(schema);
    walk(js, (o) => {
      if (o.type === "object") {
        expect(o.additionalProperties).toBe(false);
        expect([...(o.required as string[])].sort()).toEqual(Object.keys(o.properties as object).sort());
      }
      for (const k of ["minLength", "maxLength", "minItems", "maxItems", "pattern", "$schema", "format"]) expect(o).not.toHaveProperty(k);
      expect(o.type === "number" || o.type === "integer").toBe(false);
    });
  });

  it("sends strict JSON schema, system + user messages, temperature 0, and no tools", () => {
    const p = buildGroqParams(req, "openai/gpt-oss-120b") as Record<string, unknown>;
    expect(p).toMatchObject({ model: "openai/gpt-oss-120b", temperature: 0, response_format: { type: "json_schema", json_schema: { name: "adaptive_deals_extract", strict: true } } });
    expect((p.messages as { role: string }[]).map((m) => m.role)).toEqual(["system", "user"]);
    expect(p.tools).toBeUndefined();
    expect(p.tool_choice).toBeUndefined();
  });

  const fake = (impl: () => unknown) => ({ chat: { completions: { create: async () => impl() } } }) as never;
  const ok = (content: string | null, finish = "stop") => ({ model: "openai/gpt-oss-120b", choices: [{ finish_reason: finish, message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 20 } });

  it("parses output and records provider, model and temperature", async () => {
    const r = await new GroqProvider("openai/gpt-oss-120b", fake(() => ok(JSON.stringify(heroOutputs().extract)))).generate(req);
    expect(r).toMatchObject({ ok: true, raw: heroOutputs().extract, meta: { provider: "groq", model: "openai/gpt-oss-120b", temperature: "0", usage: { inputTokens: 10, outputTokens: 20 } } });
  });

  it("maps truncation, empty or non-JSON output and SDK errors to safe failures", async () => {
    const run = (impl: () => unknown) => new GroqProvider("openai/gpt-oss-120b", fake(impl)).generate(req);
    expect(await run(() => ok("{\"fields\":", "length"))).toMatchObject({ ok: false, failure: "truncated" });
    expect(await run(() => ok(null))).toMatchObject({ ok: false, failure: "schema_invalid" });
    expect(await run(() => ok("not json"))).toMatchObject({ ok: false, failure: "schema_invalid", raw: "not json" });
    expect(await run(() => { throw Object.create(Groq.APIConnectionError.prototype); })).toMatchObject({ ok: false, failure: "unavailable" });
    expect(await run(() => { throw Object.create(Groq.AuthenticationError.prototype); })).toMatchObject({ ok: false, failure: "not_configured" });
    expect(await run(() => { throw Object.create(Groq.RateLimitError.prototype); })).toMatchObject({ ok: false, failure: "unavailable" });
  });
});
