import type { ModelProvider, StructuredRequest } from "./provider";
import { cerebrasBaseUrl, requestCerebrasStructured, type CerebrasFetch } from "./cerebras-http";

const MAX_TOKENS = 16_000;

export class CerebrasProvider implements ModelProvider {
  readonly name = "cerebras" as const;

  constructor(
    readonly model: string,
    private readonly transport?: CerebrasFetch,
    private readonly apiKey = "",
    private readonly baseUrl = cerebrasBaseUrl(),
  ) {}

  generate(req: StructuredRequest) {
    return requestCerebrasStructured({
      model: this.model,
      system: req.prompt.system,
      user: req.user,
      schemaName: `adaptive_deals_${req.task}`,
      schema: req.schema,
      maxTokens: MAX_TOKENS,
      apiKey: this.apiKey,
    }, { transport: this.transport, baseUrl: this.baseUrl });
  }
}
