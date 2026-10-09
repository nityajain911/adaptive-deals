import { AnthropicProvider } from "./anthropic-provider";
import { KEY_VARS, liveAvailability } from "./config";
import { GroqProvider } from "./groq-provider";
import type { ModelProvider } from "./provider";

/** A real model provider when credentials exist; otherwise null (the caller shows why). */
export function createLiveProvider(env: Record<string, string | undefined> = process.env): ModelProvider | null {
  const a = liveAvailability(env);
  if (!a.available) return null;
  if (a.provider === "cerebras") return null;
  const key = env[KEY_VARS[a.provider]]!.trim();
  return a.provider === "groq" ? new GroqProvider(a.model, undefined, key) : new AnthropicProvider(a.model, undefined, key);
}
