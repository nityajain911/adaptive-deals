/**
 * Environment configuration for the AI layer. Never logs or returns the key itself.
 */
export const DEFAULT_MODEL = "claude-opus-5";

export interface AiConfig {
  model: string;
  liveAvailable: boolean;
}

export function readAiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  return {
    model: env.ADAPTIVE_DEALS_MODEL?.trim() || DEFAULT_MODEL,
    liveAvailable: Boolean(env.ANTHROPIC_API_KEY?.trim()),
  };
}

/**
 * Models that still accept sampling parameters. Current Opus/Fable/Sonnet 5 models reject
 * `temperature`, so it is sent only where supported and the run record says which applied.
 */
export function supportsTemperature(model: string): boolean {
  return /claude-(haiku-4-5|sonnet-4-6|opus-4-6|sonnet-4-5|opus-4-5|opus-4-1|sonnet-4|opus-4|3-)/.test(model) && !/opus-4-[78]/.test(model);
}

export type LiveAvailability = { available: true; model: string } | { available: false; reason: string };

/** Whether "Run live" can call a real model. Never falls back to replay under a live label. */
export function liveAvailability(env: Record<string, string | undefined> = process.env): LiveAvailability {
  const c = readAiConfig(env);
  return c.liveAvailable ? { available: true, model: c.model } : { available: false, reason: "ANTHROPIC_API_KEY is not set; the bundled synthetic replay is used instead and labelled as such" };
}
