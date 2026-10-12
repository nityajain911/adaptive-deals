import { AnthropicProvider } from "./anthropic-provider";
import { cerebrasBaseUrl } from "./cerebras-http";
import { CerebrasProvider } from "./cerebras-provider";
import { DEFAULT_MODELS, KEY_VARS, liveAvailability } from "./config";
import { GroqProvider } from "./groq-provider";
import type { ModelProvider, ProviderName, ProviderResult, StructuredRequest } from "./provider";

/** A real model provider when credentials exist; otherwise null (the caller shows why). */
export function createLiveProvider(env: Record<string, string | undefined> = process.env): ModelProvider | null {
  const a = liveAvailability(env);
  if (!a.available) return null;
  const key = env[KEY_VARS[a.provider]]!.trim();
  if (a.provider === "cerebras") return new CerebrasProvider(a.model, undefined, key, cerebrasBaseUrl(env));
  return a.provider === "groq" ? new GroqProvider(a.model, undefined, key) : new AnthropicProvider(a.model, undefined, key);
}

/** The providers to try, in order: Cerebras, then Groq, each only if its key is set. Anthropic is never part of the chain. */
export function createLiveChain(env: Record<string, string | undefined> = process.env): ModelProvider[] {
  const chain: ModelProvider[] = [];
  const cerebras = env[KEY_VARS.cerebras]?.trim();
  if (cerebras) chain.push(new CerebrasProvider(DEFAULT_MODELS.cerebras, undefined, cerebras, cerebrasBaseUrl(env)));
  const groq = env[KEY_VARS.groq]?.trim();
  if (groq) chain.push(new GroqProvider(DEFAULT_MODELS.groq, undefined, groq));
  return chain;
}

export interface ChainAttempt {
  provider: ProviderName;
  model: string;
  outcome: "ok" | "failed" | "timed_out";
  detail?: string;
}
export type ChainOutcome = { ok: true; result: Extract<ProviderResult, { ok: true }>; attempts: ChainAttempt[] } | { ok: false; attempts: ChainAttempt[] };

/**
 * Ask each provider in turn until one returns a valid answer. A provider that errors, times out or throws is skipped,
 * and the caller falls back to its own recorded or rule-based values when none answers. Never throws.
 */
export async function generateWithFallback(chain: ModelProvider[], request: StructuredRequest, timeoutMs = 12_000): Promise<ChainOutcome> {
  const attempts: ChainAttempt[] = [];
  for (const provider of chain) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), timeoutMs); });
      const result = await Promise.race([provider.generate(request), timeout]);
      if (result === "timeout") attempts.push({ provider: provider.name, model: provider.model, outcome: "timed_out" });
      else if (result.ok) {
        attempts.push({ provider: provider.name, model: provider.model, outcome: "ok" });
        return { ok: true, result, attempts };
      } else attempts.push({ provider: provider.name, model: provider.model, outcome: "failed", detail: result.failure });
    } catch (error) {
      attempts.push({ provider: provider.name, model: provider.model, outcome: "failed", detail: error instanceof Error ? error.message.slice(0, 80) : "error" });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return { ok: false, attempts };
}
