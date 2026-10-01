import { FixedClock } from "@/domain/clock";
import { runConstruct } from "@/ai/orchestrator";
import type { ModelProvider, ProviderFailureKind, ProviderResult, StructuredRequest } from "@/ai/provider";
import type { AiTask } from "@/ai/schemas";
import { SyntheticAuthoredProvider } from "@/ai/synthetic-provider";
import { heroDeal, heroRecordedAnswers } from "@/data/synthetic/hero-run";
import { heroSyntheticClarificationOutput, heroSyntheticExplanationOutput, heroSyntheticExtractionOutput } from "@/data/synthetic/hero-ai-outputs";

export const heroOutputs = () => structuredClone({ extract: heroSyntheticExtractionOutput, clarify: heroSyntheticClarificationOutput, explain: heroSyntheticExplanationOutput });

/** Scriptable provider: per task, return an output, a failure, or throw. Records every request. */
export class ScriptedProvider implements ModelProvider {
  readonly name = "anthropic" as const;
  readonly model = "test-model";
  readonly requests: StructuredRequest[] = [];
  constructor(private readonly script: Partial<Record<AiTask, unknown>>) {}
  async generate(req: StructuredRequest): Promise<ProviderResult> {
    this.requests.push(req);
    const meta = { provider: this.name, model: this.model, temperature: "not sent: unsupported by model" };
    const v = this.script[req.task];
    if (v && typeof v === "object" && "fail" in v) return { ok: false, failure: (v as { fail: ProviderFailureKind }).fail, message: "scripted failure", meta };
    if (v === undefined) return { ok: false, failure: "unavailable", message: "no script", meta };
    return { ok: true, raw: structuredClone(v), meta };
  }
}

export async function heroRun(provider: ModelProvider, opts: { answers?: boolean; deal?: ReturnType<typeof heroDeal> } = {}) {
  const deal = opts.deal ?? heroDeal();
  const first = await runConstruct({ provider, kind: "live", runId: "run-test", clock: new FixedClock(), deal });
  if (!opts.answers) return first;
  return runConstruct({ provider, kind: "live", runId: "run-test", clock: new FixedClock(), deal, answers: heroRecordedAnswers, previous: first.record });
}

export const syntheticHeroProvider = () => new SyntheticAuthoredProvider(heroOutputs(), ['id="msg-2"']);
