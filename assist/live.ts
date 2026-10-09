import type Anthropic from "@anthropic-ai/sdk";
import { cerebrasBaseUrl, type CerebrasFetch } from "@/ai/cerebras-http";
import { KEY_VARS, liveAvailability } from "@/ai/config";
import type { AssistGroqClient } from "./groq";
import { AssistAnthropic } from "./anthropic";
import { AssistCerebras } from "./cerebras";
import { AssistGroq } from "./groq";
import type { AssistProvider } from "./provider";

export interface AssistFactoryOptions {
  cerebrasTransport?: CerebrasFetch;
  groqClient?: AssistGroqClient;
  anthropicClient?: Anthropic;
}

export function createLiveAssistProvider(env: Record<string, string | undefined> = process.env, options: AssistFactoryOptions = {}): AssistProvider | null {
  const availability = liveAvailability(env);
  if (!availability.available) return null;
  const key = env[KEY_VARS[availability.provider]]!.trim();
  if (availability.provider === "cerebras") return new AssistCerebras(availability.model, options.cerebrasTransport, key, cerebrasBaseUrl(env));
  if (availability.provider === "groq") return new AssistGroq(availability.model, options.groqClient, key);
  return new AssistAnthropic(availability.model, options.anthropicClient, key);
}
