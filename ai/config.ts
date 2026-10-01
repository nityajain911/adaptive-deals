/**
 * Environment configuration for the AI layer. Never logs or returns a key.
 * Provider: ADAPTIVE_DEALS_PROVIDER = "groq" (default) | "anthropic".
 */
export type LiveProviderName = "groq" | "anthropic";

export const DEFAULT_MODELS: Record<LiveProviderName, string> = {
  groq: "openai/gpt-oss-120b",
  anthropic: "claude-opus-5",
};
export const KEY_VARS: Record<LiveProviderName, string> = { groq: "GROQ_API_KEY", anthropic: "ANTHROPIC_API_KEY" };
/** @deprecated kept for callers that only need the Anthropic default */
export const DEFAULT_MODEL = DEFAULT_MODELS.anthropic;

export interface AiConfig {
  provider: LiveProviderName;
  model: string;
  liveAvailable: boolean;
}

export function readAiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  const provider: LiveProviderName = env.ADAPTIVE_DEALS_PROVIDER?.trim() === "anthropic" ? "anthropic" : "groq";
  return {
    provider,
    model: env.ADAPTIVE_DEALS_MODEL?.trim() || DEFAULT_MODELS[provider],
    liveAvailable: Boolean(env[KEY_VARS[provider]]?.trim()),
  };
}

/**
 * Anthropic models that still accept sampling parameters. Current Opus/Fable/Sonnet 5 models
 * reject `temperature`, so it is sent only where supported. (Groq always receives 0.)
 */
export function supportsTemperature(model: string): boolean {
  return /claude-(haiku-4-5|sonnet-4-6|opus-4-6|sonnet-4-5|opus-4-5|opus-4-1|sonnet-4|opus-4|3-)/.test(model) && !/opus-4-[78]/.test(model);
}

export type LiveAvailability = { available: true; provider: LiveProviderName; model: string } | { available: false; provider: LiveProviderName; reason: string };

/** Whether "Run live" can call a real model. Never falls back to replay under a live label. */
export function liveAvailability(env: Record<string, string | undefined> = process.env): LiveAvailability {
  const c = readAiConfig(env);
  return c.liveAvailable
    ? { available: true, provider: c.provider, model: c.model }
    : { available: false, provider: c.provider, reason: `${KEY_VARS[c.provider]} is not set; the bundled synthetic replay is used instead and labelled as such` };
}
