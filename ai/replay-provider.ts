import type { ModelProvider, ProviderMeta, ProviderName, ProviderResult, StructuredRequest } from "./provider";
import type { RunStep } from "./run-record";

/**
 * Serves the stored outputs of ONE run, keyed by the exact request hash, and reports the
 * original step's provider/model. A request the run never made is refused, so a replay can
 * never be assembled from a different input or a different run.
 */
export class ReplayProvider implements ModelProvider {
  private readonly byHash: Map<string, RunStep>;

  constructor(
    readonly name: Extract<ProviderName, "synthetic_replay" | "recorded_replay">,
    readonly model: string,
    steps: RunStep[],
  ) {
    this.byHash = new Map(steps.filter((s) => s.failure === null).map((s) => [s.inputHash, s]));
  }

  async generate(req: StructuredRequest): Promise<ProviderResult> {
    const step = this.byHash.get(req.inputHash);
    if (!step) {
      const meta: ProviderMeta = { provider: this.name, model: this.model, temperature: "not applicable: replay" };
      return { ok: false, failure: "replay_mismatch", message: `No stored ${req.task} output for this exact input`, meta };
    }
    return { ok: true, raw: structuredClone(step.rawOutput), meta: { provider: step.provider, model: step.model, temperature: step.temperature } };
  }
}
