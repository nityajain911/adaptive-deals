import Groq from "groq-sdk";
import type { ModelProvider, ProviderMeta, ProviderResult, StructuredRequest } from "./provider";
import { toStrictJsonSchema } from "./strict-schema";

const MAX_TOKENS = 16_000;

/**
 * Request parameters for one structured call on Groq. Pure, so tests can assert what is sent:
 * strict JSON-schema output, temperature 0, and no tools — the model cannot call any API.
 */
export function buildGroqParams(req: StructuredRequest, model: string) {
  return {
    model,
    max_completion_tokens: MAX_TOKENS,
    temperature: 0,
    messages: [
      { role: "system" as const, content: req.prompt.system },
      { role: "user" as const, content: req.user },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: { name: `adaptive_deals_${req.task}`, strict: true, schema: toStrictJsonSchema(req.schema) },
    },
  };
}

type GroqLike = { chat: { completions: { create: (p: ReturnType<typeof buildGroqParams>) => Promise<{ model: string; choices: { finish_reason: string | null; message: { content: string | null } }[]; usage?: { prompt_tokens: number; completion_tokens: number } | null }> } } };

export class GroqProvider implements ModelProvider {
  readonly name = "groq" as const;
  private readonly client: GroqLike;

  constructor(
    readonly model: string,
    client?: GroqLike,
    apiKey?: string,
  ) {
    this.client = client ?? (new Groq(apiKey ? { apiKey } : {}) as unknown as GroqLike);
  }

  async generate(req: StructuredRequest): Promise<ProviderResult> {
    const meta: ProviderMeta = { provider: this.name, model: this.model, temperature: "0" };
    try {
      const res = await this.client.chat.completions.create(buildGroqParams(req, this.model));
      const choice = res.choices[0];
      const full: ProviderMeta = { ...meta, model: res.model ?? this.model, stopReason: choice?.finish_reason ?? null, usage: res.usage ? { inputTokens: res.usage.prompt_tokens, outputTokens: res.usage.completion_tokens } : null };
      if (!choice) return { ok: false, failure: "api_error", message: "No completion returned", meta: full };
      if (choice.finish_reason === "length") return { ok: false, failure: "truncated", message: "Model output was truncated", raw: choice.message.content, meta: full };
      const text = choice.message.content;
      if (!text) return { ok: false, failure: "schema_invalid", message: "Empty model output", meta: full };
      try {
        return { ok: true, raw: JSON.parse(text), meta: full };
      } catch {
        return { ok: false, failure: "schema_invalid", message: "Output was not valid JSON", raw: text, meta: full };
      }
    } catch (error) {
      if (error instanceof Groq.AuthenticationError) return { ok: false, failure: "not_configured", message: "Model credentials were rejected", meta };
      if (error instanceof Groq.RateLimitError) return { ok: false, failure: "unavailable", message: "Model rate-limited", meta };
      if (error instanceof Groq.APIConnectionError) return { ok: false, failure: "unavailable", message: "Model unreachable", meta };
      if (error instanceof Groq.BadRequestError) return { ok: false, failure: "schema_invalid", message: "Model request rejected (400), e.g. output failed the schema", meta };
      if (error instanceof Groq.APIError) return { ok: false, failure: "api_error", message: `Model API error ${error.status ?? ""}`.trim(), meta };
      return { ok: false, failure: "api_error", message: error instanceof Error ? error.message.slice(0, 200) : "Unknown model error", meta };
    }
  }
}
