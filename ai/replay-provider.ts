import type { ModelProvider, ProviderMeta, ProviderName, ProviderResult, StructuredRequest } from "./provider";

/**
 * Serves stored raw outputs keyed by the exact request hash. A request that does not match a
 * stored step is refused, so a replay can never be assembled from a different input or run.
 */
export class ReplayProvider implements ModelProvider {
  constructor(
    readonly name: Extract<ProviderName, "synthetic_replay" | "recorded_replay">,
    readonly model: string,
    private readonly outputs: Map<string, unknown>,
  ) {}

  async generate(req: StructuredRequest): Promise<ProviderResult> {
    const meta: ProviderMeta = { provider: this.name, model: this.model, temperature: "not applicable: replay" };
    if (!this.outputs.has(req.inputHash)) {
      return { ok: false, failure: "replay_mismatch", message: `No stored ${req.task} output for this exact input`, meta };
    }
    return { ok: true, raw: structuredClone(this.outputs.get(req.inputHash)), meta };
  }
}
