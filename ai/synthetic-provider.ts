import type { ModelProvider, ProviderMeta, ProviderResult, StructuredRequest } from "./provider";
import type { AiTask } from "./schemas";

/**
 * Credential-free provider serving hand-written outputs for one known deal. It is labelled
 * synthetic everywhere and refuses requests for any other conversation.
 */
export class SyntheticAuthoredProvider implements ModelProvider {
  readonly name = "synthetic_replay" as const;
  readonly model = "none (synthetic outputs written by hand)";

  constructor(
    private readonly outputs: Partial<Record<AiTask, unknown>>,
    private readonly mustContain: string[],
  ) {}

  async generate(req: StructuredRequest): Promise<ProviderResult> {
    const meta: ProviderMeta = { provider: this.name, model: this.model, temperature: "not applicable: synthetic" };
    const forThisDeal = req.task !== "extract" || this.mustContain.every((s) => req.user.includes(s));
    if (!forThisDeal || !(req.task in this.outputs)) {
      return { ok: false, failure: "replay_mismatch", message: `No synthetic ${req.task} output for this input`, meta };
    }
    return { ok: true, raw: structuredClone(this.outputs[req.task]), meta };
  }
}
