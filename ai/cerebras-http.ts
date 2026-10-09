import type { z } from "zod";
import type { ProviderMeta, ProviderResult } from "./provider";
import { toStrictJsonSchema } from "./strict-schema";

export const CEREBRAS_CHAT_COMPLETIONS_URL = "https://api.cerebras.ai/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 30_000;

export type CerebrasFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface CerebrasStructuredArgs {
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: z.ZodType;
  maxTokens: number;
  apiKey: string;
}

export interface CerebrasRequestOptions {
  transport?: CerebrasFetch;
  baseUrl?: string;
  timeoutMs?: number;
}

export function cerebrasBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return env.ADAPTIVE_DEALS_E2E === "1" && env.CEREBRAS_API_BASE_URL?.trim()
    ? env.CEREBRAS_API_BASE_URL.trim()
    : CEREBRAS_CHAT_COMPLETIONS_URL;
}

export function buildCerebrasBody(args: Omit<CerebrasStructuredArgs, "apiKey">) {
  return {
    model: args.model,
    max_completion_tokens: args.maxTokens,
    temperature: 0,
    messages: [
      { role: "system" as const, content: args.system },
      { role: "user" as const, content: args.user },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: { name: args.schemaName, strict: true, schema: toStrictJsonSchema(args.schema) },
    },
  };
}

type Completion = {
  model?: string;
  choices?: { finish_reason?: string | null; message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
};

const failure = (meta: ProviderMeta, kind: Extract<ProviderResult, { ok: false }>["failure"], message: string, raw?: unknown): ProviderResult =>
  raw === undefined ? { ok: false, failure: kind, message, meta } : { ok: false, failure: kind, message, raw, meta };

export async function requestCerebrasStructured(args: CerebrasStructuredArgs, options: CerebrasRequestOptions = {}): Promise<ProviderResult> {
  const meta: ProviderMeta = { provider: "cerebras", model: args.model, temperature: "0" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await (options.transport ?? fetch)(options.baseUrl ?? CEREBRAS_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${args.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(buildCerebrasBody(args)),
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) return failure(meta, "not_configured", "Model credentials were rejected");
      if (response.status === 429) return failure(meta, "unavailable", "Model rate-limited");
      if (response.status === 400) return failure(meta, "schema_invalid", "Model request rejected (400)");
      if (response.status >= 500) return failure(meta, "api_error", `Model API error ${response.status}`);
      return failure(meta, "api_error", `Model API error ${response.status}`);
    }
    let payload: Completion;
    try {
      payload = (await response.json()) as Completion;
    } catch {
      return failure(meta, "schema_invalid", "Model response was not valid JSON");
    }
    const choice = payload.choices?.[0];
    const full: ProviderMeta = {
      ...meta,
      model: payload.model ?? args.model,
      stopReason: choice?.finish_reason ?? null,
      usage: payload.usage ? { inputTokens: payload.usage.prompt_tokens ?? 0, outputTokens: payload.usage.completion_tokens ?? 0 } : null,
    };
    if (!choice) return failure(full, "api_error", "No completion returned");
    const text = choice.message?.content;
    if (choice.finish_reason === "length") return failure(full, "truncated", "Model output was truncated", text ?? null);
    if (!text) return failure(full, "schema_invalid", "Empty model output");
    try {
      return { ok: true, raw: JSON.parse(text), meta: full };
    } catch {
      return failure(full, "schema_invalid", "Output was not valid JSON", text);
    }
  } catch {
    return failure(meta, "unavailable", "Model unreachable");
  } finally {
    clearTimeout(timer);
  }
}
