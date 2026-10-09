import { liveAvailability, type LiveProviderName } from "@/ai/config";
import { createLiveProvider } from "@/ai/live";
import type { ModelProvider } from "@/ai/provider";

export type RecordingProviderFreeze = { provider: LiveProviderName; model: string };

/** Construct only the provider and model named by the signed-off recording freeze. */
export function recordingProviderFromFreeze(
  freeze: RecordingProviderFreeze,
  env: Record<string, string | undefined> = process.env,
): ModelProvider {
  const availability = liveAvailability(env);
  if (availability.provider !== freeze.provider) {
    throw new Error(`Recording freeze requires ${freeze.provider}; configured provider is ${availability.provider}`);
  }
  if (!availability.available) throw new Error(`Live model unavailable: ${availability.reason}`);
  if (availability.model !== freeze.model) {
    throw new Error(`Recording freeze requires model ${freeze.model}; configured model is ${availability.model}`);
  }
  const provider = createLiveProvider(env);
  if (!provider) throw new Error("The frozen live provider could not be constructed");
  return provider;
}
