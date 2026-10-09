import Groq from "groq-sdk";
import type { z } from "zod";
import { toStrictJsonSchema } from "@/ai/strict-schema";
import type { AssistMeta, AssistProvider, AssistRequest, AssistResult } from "./provider";

export type { AssistFailure, AssistMeta, AssistResult } from "./provider";

const MAX_TOKENS = 2_000;

/** One structured call: the exact parameters, so a test can assert what is sent. Strict JSON schema, temperature 0, no tools. */
export function buildAssistGroqParams(args: { model: string; system: string; user: string; name: string; schema: z.ZodType }) {
  return {
    model: args.model,
    max_completion_tokens: MAX_TOKENS,
    temperature: 0,
    messages: [
      { role: "system" as const, content: args.system },
      { role: "user" as const, content: args.user },
    ],
    response_format: { type: "json_schema" as const, json_schema: { name: args.name, strict: true, schema: toStrictJsonSchema(args.schema) } },
  };
}

type Params = ReturnType<typeof buildAssistGroqParams>;
type Completion = { model: string; choices: { finish_reason: string | null; message: { content: string | null } }[]; usage?: { prompt_tokens: number; completion_tokens: number } | null };
export type AssistGroqClient = { chat: { completions: { create: (p: Params) => Promise<Completion> } } };

/**
 * The only way the assist tasks reach a model. It has no tools and no access to any action. The key is read
 * by the SDK from the environment and is never logged or stored here.
 */
export class AssistGroq implements AssistProvider {
  readonly name = "groq" as const;
  private readonly client: AssistGroqClient;
  constructor(readonly model: string, client?: AssistGroqClient, apiKey?: string) {
    this.client = client ?? (new Groq(apiKey ? { apiKey } : {}) as unknown as AssistGroqClient);
  }

  async generate(args: AssistRequest): Promise<AssistResult> {
    try {
      const res = await this.client.chat.completions.create(buildAssistGroqParams({ model: this.model, ...args }));
      const choice = res.choices[0];
      const meta: AssistMeta = { provider: "groq", model: res.model ?? this.model, stopReason: choice?.finish_reason ?? null, usage: res.usage ? { inputTokens: res.usage.prompt_tokens, outputTokens: res.usage.completion_tokens } : null };
      if (!choice) return { ok: false, failure: "api_error", message: "No completion returned", meta };
      if (choice.finish_reason === "length") return { ok: false, failure: "truncated", message: "Model output was truncated", meta };
      if (!choice.message.content) return { ok: false, failure: "invalid_output", message: "Empty model output", meta };
      try {
        return { ok: true, raw: JSON.parse(choice.message.content), meta };
      } catch {
        return { ok: false, failure: "invalid_output", message: "Output was not valid JSON", meta };
      }
    } catch (error) {
      if (error instanceof Groq.AuthenticationError) return { ok: false, failure: "not_configured", message: "Model credentials were rejected", meta: null };
      if (error instanceof Groq.RateLimitError) return { ok: false, failure: "unavailable", message: "Model rate-limited", meta: null };
      if (error instanceof Groq.APIConnectionError) return { ok: false, failure: "unavailable", message: "Model unreachable", meta: null };
      if (error instanceof Groq.BadRequestError) return { ok: false, failure: "invalid_output", message: "Model request rejected (400)", meta: null };
      return { ok: false, failure: "api_error", message: error instanceof Error ? error.message.slice(0, 200) : "Unknown model error", meta: null };
    }
  }
}
