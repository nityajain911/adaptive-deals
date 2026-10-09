import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildExtractionRequest } from "@/ai/extract";
import { CerebrasProvider } from "@/ai/cerebras-provider";
import { buildCerebrasBody, requestCerebrasStructured, type CerebrasFetch } from "@/ai/cerebras-http";
import { heroMessages, heroPackages } from "@/data/synthetic/hero";
import { heroOutputs } from "./helpers";

const req = buildExtractionRequest(heroMessages, heroPackages);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const completion = (content: string | null, finishReason = "stop") => ({
  model: "gpt-oss-120b",
  choices: [{ finish_reason: finishReason, message: { content } }],
  usage: { prompt_tokens: 11, completion_tokens: 22 },
});

describe("Cerebras strict structured output", () => {
  it("sends strict JSON schema, bounded output, no tools and bearer authentication", async () => {
    let target = "";
    let init: RequestInit | undefined;
    const transport: CerebrasFetch = async (input, options) => {
      target = String(input);
      init = options;
      return json(completion(JSON.stringify(heroOutputs().extract)));
    };
    const provider = new CerebrasProvider("gpt-oss-120b", transport, "csk-secret", "https://fixture.test/v1/chat/completions");
    const result = await provider.generate(req);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(target).toBe("https://fixture.test/v1/chat/completions");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer csk-secret");
    expect(body).toMatchObject({ model: "gpt-oss-120b", temperature: 0, max_completion_tokens: 16_000, response_format: { type: "json_schema", json_schema: { name: "adaptive_deals_extract", strict: true } } });
    expect((body.messages as { role: string }[]).map((message) => message.role)).toEqual(["system", "user"]);
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("tool_choice");
    expect(result).toMatchObject({ ok: true, meta: { provider: "cerebras", model: "gpt-oss-120b", temperature: "0", usage: { inputTokens: 11, outputTokens: 22 } } });
  });

  it("builds the same closed schema for assist-sized requests", () => {
    const body = buildCerebrasBody({ model: "gpt-oss-120b", system: "system", user: "user", schemaName: "assist", schema: z.object({ answer: z.string() }).strict(), maxTokens: 2_000 });
    expect(body).toMatchObject({ max_completion_tokens: 2_000, response_format: { json_schema: { name: "assist", strict: true, schema: { type: "object", additionalProperties: false, required: ["answer"] } } } });
  });

  it.each([
    [401, "not_configured"],
    [403, "not_configured"],
    [429, "unavailable"],
    [400, "schema_invalid"],
    [500, "api_error"],
  ] as const)("maps HTTP %s to %s without returning provider bodies or keys", async (status, failure) => {
    const result = await requestCerebrasStructured({ model: "gpt-oss-120b", system: "s", user: "u", schemaName: "x", schema: z.object({ ok: z.boolean() }), maxTokens: 50, apiKey: "csk-secret" }, { transport: async () => new Response("raw secret diagnostic", { status }) });
    expect(result).toMatchObject({ ok: false, failure });
    expect(JSON.stringify(result)).not.toMatch(/csk-secret|raw secret diagnostic/);
  });

  it("maps connection failures, truncation and invalid successful responses safely", async () => {
    const args = { model: "gpt-oss-120b", system: "s", user: "u", schemaName: "x", schema: z.object({ ok: z.boolean() }), maxTokens: 50, apiKey: "csk-secret" };
    expect(await requestCerebrasStructured(args, { transport: async () => { throw new Error("socket included raw diagnostic"); } })).toMatchObject({ ok: false, failure: "unavailable", message: "Model unreachable" });
    expect(await requestCerebrasStructured(args, { transport: async () => json(completion("{", "length")) })).toMatchObject({ ok: false, failure: "truncated" });
    expect(await requestCerebrasStructured(args, { transport: async () => json({ choices: [] }) })).toMatchObject({ ok: false, failure: "api_error" });
    expect(await requestCerebrasStructured(args, { transport: async () => json(completion(null)) })).toMatchObject({ ok: false, failure: "schema_invalid" });
    expect(await requestCerebrasStructured(args, { transport: async () => json(completion("not json")) })).toMatchObject({ ok: false, failure: "schema_invalid" });
  });
});
