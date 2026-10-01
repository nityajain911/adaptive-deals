import { AnthropicProvider } from "./anthropic-provider";
import { liveAvailability } from "./config";
import type { ModelProvider } from "./provider";

/** A real model provider when credentials exist; otherwise null (the caller shows why). */
export function createLiveProvider(env: Record<string, string | undefined> = process.env): ModelProvider | null {
  const a = liveAvailability(env);
  return a.available ? new AnthropicProvider(a.model) : null;
}
