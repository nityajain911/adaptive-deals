import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { supportsTemperature } from "@/ai/config";
import type { AssistProvider, AssistRequest, AssistResult } from "./provider";

const MAX_TOKENS = 2_000;

export class AssistAnthropic implements AssistProvider {
  readonly name = "anthropic" as const;
  private readonly client: Anthropic;

  constructor(readonly model: string, client?: Anthropic, apiKey?: string) {
    this.client = client ?? new Anthropic(apiKey ? { apiKey } : {});
  }

  async generate(args: AssistRequest): Promise<AssistResult> {
    try {
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: args.system,
        messages: [{ role: "user", content: args.user }],
        output_config: { format: zodOutputFormat(args.schema) },
        ...(supportsTemperature(this.model) ? { temperature: 0 } : {}),
      });
      const meta = { provider: "anthropic" as const, model: response.model, stopReason: response.stop_reason, usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } };
      if (response.stop_reason === "max_tokens") return { ok: false, failure: "truncated", message: "Model output was truncated", meta };
      if (response.stop_reason === "refusal") return { ok: false, failure: "invalid_output", message: "Model declined the request", meta };
      if (response.parsed_output == null) return { ok: false, failure: "invalid_output", message: "Output did not match the schema", meta };
      return { ok: true, raw: response.parsed_output, meta };
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) return { ok: false, failure: "not_configured", message: "Model credentials were rejected", meta: null };
      if (error instanceof Anthropic.RateLimitError) return { ok: false, failure: "unavailable", message: "Model rate-limited", meta: null };
      if (error instanceof Anthropic.APIConnectionError) return { ok: false, failure: "unavailable", message: "Model unreachable", meta: null };
      if (error instanceof Anthropic.APIError) return { ok: false, failure: "api_error", message: `Model API error ${error.status ?? ""}`.trim(), meta: null };
      return { ok: false, failure: "invalid_output", message: "Model output was invalid", meta: null };
    }
  }
}
