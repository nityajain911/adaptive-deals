import type { z } from "zod";
import type { LiveProviderName } from "@/ai/config";

export interface AssistRequest {
  system: string;
  user: string;
  name: string;
  schema: z.ZodType;
}

export type AssistFailure = "unavailable" | "not_configured" | "truncated" | "invalid_output" | "api_error";

export interface AssistMeta {
  provider: LiveProviderName;
  model: string;
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number } | null;
}

export type AssistResult =
  | { ok: true; raw: unknown; meta: AssistMeta }
  | { ok: false; failure: AssistFailure; message: string; meta: AssistMeta | null };

export interface AssistProvider {
  readonly name: LiveProviderName;
  readonly model: string;
  generate(args: AssistRequest): Promise<AssistResult>;
}
