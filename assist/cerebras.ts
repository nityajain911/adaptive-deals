import { requestCerebrasStructured, type CerebrasFetch } from "@/ai/cerebras-http";
import type { ProviderFailureKind } from "@/ai/provider";
import type { AssistFailure, AssistProvider, AssistRequest, AssistResult } from "./provider";

const MAX_TOKENS = 2_000;

const assistFailure = (failure: ProviderFailureKind): AssistFailure => {
  if (failure === "not_configured" || failure === "unavailable" || failure === "truncated" || failure === "api_error") return failure;
  return "invalid_output";
};

export class AssistCerebras implements AssistProvider {
  readonly name = "cerebras" as const;

  constructor(
    readonly model: string,
    private readonly transport?: CerebrasFetch,
    private readonly apiKey = "",
    private readonly baseUrl?: string,
  ) {}

  async generate(args: AssistRequest): Promise<AssistResult> {
    const result = await requestCerebrasStructured({ model: this.model, ...args, schemaName: args.name, maxTokens: MAX_TOKENS, apiKey: this.apiKey }, { transport: this.transport, baseUrl: this.baseUrl });
    if (result.ok) return { ok: true, raw: result.raw, meta: { provider: "cerebras", model: result.meta.model, stopReason: result.meta.stopReason ?? null, usage: result.meta.usage ?? null } };
    return { ok: false, failure: assistFailure(result.failure), message: result.message, meta: { provider: "cerebras", model: result.meta.model, stopReason: result.meta.stopReason ?? null, usage: result.meta.usage ?? null } };
  }
}
