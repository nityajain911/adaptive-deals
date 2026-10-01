import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { supportsTemperature } from "./config";
import type { ModelProvider, ProviderMeta, ProviderResult, StructuredRequest } from "./provider";

const MAX_TOKENS = 16_000;

/**
 * Request parameters for one structured call. Pure, so tests can assert what is (and is not)
 * sent: no tools are ever attached, so the model cannot call any API — including payments.
 */
export function buildRequestParams(req: StructuredRequest, model: string) {
  return {
    model,
    max_tokens: MAX_TOKENS,
    system: req.prompt.system,
    messages: [{ role: "user" as const, content: req.user }],
    output_config: { format: zodOutputFormat(req.schema) },
    ...(supportsTemperature(model) ? { temperature: 0 } : {}),
  };
}

export class AnthropicProvider implements ModelProvider {
  readonly name = "anthropic" as const;
  private readonly client: Anthropic;

  constructor(
    readonly model: string,
    client?: Anthropic,
    apiKey?: string,
  ) {
    this.client = client ?? new Anthropic(apiKey ? { apiKey } : {});
  }

  async generate(req: StructuredRequest): Promise<ProviderResult> {
    const meta: ProviderMeta = { provider: this.name, model: this.model, temperature: supportsTemperature(this.model) ? "0" : "not sent: unsupported by model" };
    try {
      const response = await this.client.messages.parse(buildRequestParams(req, this.model));
      const full: ProviderMeta = { ...meta, model: response.model, stopReason: response.stop_reason, usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } };
      if (response.stop_reason === "refusal") return { ok: false, failure: "refusal", message: "Model declined the request", meta: full };
      if (response.stop_reason === "max_tokens") return { ok: false, failure: "truncated", message: "Model output was truncated", meta: full };
      const text = response.content.find((b) => b.type === "text");
      if (response.parsed_output == null) {
        return { ok: false, failure: "schema_invalid", message: "Output did not match the schema", raw: text && "text" in text ? text.text : null, meta: full };
      }
      return { ok: true, raw: response.parsed_output, meta: full };
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) return { ok: false, failure: "not_configured", message: "Model credentials were rejected", meta };
      if (error instanceof Anthropic.RateLimitError) return { ok: false, failure: "unavailable", message: "Model rate-limited", meta };
      if (error instanceof Anthropic.APIConnectionError) return { ok: false, failure: "unavailable", message: "Model unreachable", meta };
      if (error instanceof Anthropic.APIError) return { ok: false, failure: "api_error", message: `Model API error ${error.status ?? ""}`.trim(), meta };
      // Parse helpers throw on malformed JSON; treat as schema-breaking output.
      return { ok: false, failure: "schema_invalid", message: error instanceof Error ? error.message.slice(0, 200) : "Unknown model error", meta };
    }
  }
}
