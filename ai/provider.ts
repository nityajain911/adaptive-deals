import type { z } from "zod";
import type { AiTask } from "./schemas";
import type { PromptDefinition } from "./prompts";

export type ProviderName = "anthropic" | "synthetic_replay" | "recorded_replay";

export interface StructuredRequest {
  task: AiTask;
  prompt: PromptDefinition;
  /** User-turn content; untrusted messages are already delimited and neutralised. */
  user: string;
  schema: z.ZodType;
  /** sha256 of prompt version + user content: identifies this exact request. */
  inputHash: string;
}

export type ProviderFailureKind = "unavailable" | "not_configured" | "refusal" | "truncated" | "schema_invalid" | "api_error" | "replay_mismatch";

export interface ProviderMeta {
  provider: ProviderName;
  model: string;
  /** "0" when sent; otherwise why it was not sent. */
  temperature: string;
  stopReason?: string | null;
  usage?: { inputTokens: number; outputTokens: number } | null;
}

export type ProviderResult =
  | { ok: true; raw: unknown; meta: ProviderMeta }
  | { ok: false; failure: ProviderFailureKind; message: string; raw?: unknown; meta: ProviderMeta };

/** The only surface the AI layer talks to. It has no tools and no access to payment code. */
export interface ModelProvider {
  readonly name: ProviderName;
  readonly model: string;
  generate(req: StructuredRequest): Promise<ProviderResult>;
}
