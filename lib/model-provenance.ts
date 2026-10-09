import type { RunRecord } from "@/ai/run-record";
import type { LiveProviderName } from "@/ai/config";
import { STATE_LABEL, type ConversationItem } from "@/domain/conversation";

/**
 * Who produced a run's model-task outputs. Every visible attribution derives from this, so a
 * hand-written sample can never be credited to AI. Read from the stored run kind and from the
 * provider recorded on each step; nothing here is inferred from copy or configuration.
 */
export type ModelOutputSource = "hand_written" | "recorded_model" | "live_model" | "mixed";

export interface ModelProvenance {
  source: ModelOutputSource;
  /** True only when an actual model produced the stored outputs. */
  modelMade: boolean;
  /** Display name of the model provider, or null when no single model is credited. */
  providerName: string | null;
  label: string;
}

export const SAMPLE_OUTPUT_LABEL = "Sample output written by hand · no model ran";

const MODEL_PROVIDERS: Record<LiveProviderName, string> = { cerebras: "Cerebras", groq: "Groq", anthropic: "Anthropic" };
export const providerDisplayName = (provider: LiveProviderName): string => MODEL_PROVIDERS[provider];
const HAND_WRITTEN: ModelProvenance = { source: "hand_written", modelMade: false, providerName: null, label: SAMPLE_OUTPUT_LABEL };

type ProvenanceRecord = Pick<RunRecord, "kind" | "steps">;
type Step = RunRecord["steps"][number];
type Viewing = "replay" | "fresh";

/** A step counts as model output only in a live run, when it names a real provider. */
const stepIsModel = (record: ProvenanceRecord, step: Step): step is Step & { provider: LiveProviderName } => record.kind === "live" && step.provider in MODEL_PROVIDERS;

const modelLabel = (providerName: string, viewing: Viewing): ModelProvenance =>
  viewing === "fresh" ? { source: "live_model", modelMade: true, providerName, label: `Live ${providerName} output` } : { source: "recorded_model", modelMade: true, providerName, label: `Recorded ${providerName} output` };

/** Who produced one task's stored output; null when the task has no stored output (code did the work). */
export function taskProvenance(record: ProvenanceRecord, task: Step["task"], viewing: Viewing = "replay"): ModelProvenance | null {
  const step = record.steps.find((candidate) => candidate.task === task && candidate.failure === null);
  if (!step) return null;
  return stepIsModel(record, step) ? modelLabel(MODEL_PROVIDERS[step.provider], viewing) : HAND_WRITTEN;
}

/** Who produced the run's outputs as a whole. A model is credited only when it produced every one. */
export function modelProvenance(record: ProvenanceRecord, viewing: Viewing = "replay"): ModelProvenance {
  const produced = record.steps.filter((step) => step.failure === null);
  const model = produced.filter((step) => stepIsModel(record, step));
  if (model.length === 0) return HAND_WRITTEN;
  if (model.length !== produced.length) return { source: "mixed", modelMade: false, providerName: null, label: "Mixed sources · model output and hand-written samples" };
  const names = [...new Set(model.map((step) => MODEL_PROVIDERS[step.provider]))];
  return modelLabel(names.length === 1 ? names[0] : "model", viewing);
}

/** One task's provenance, falling back to the run's when the task has no stored output. */
export function taskOrRunProvenance(record: ProvenanceRecord, task: Step["task"], viewing: Viewing = "replay"): ModelProvenance {
  return taskProvenance(record, task, viewing) ?? modelProvenance(record, viewing);
}

const SAMPLE_WORDING_LABEL = "Sample wording written by hand";

/** Badge for a clarification question's wording. */
export function questionWordingLabel(wording: "ai" | "code_fallback", provenance: ModelProvenance): string {
  if (wording !== "ai") return "Drafted by code";
  return provenance.modelMade ? "Suggested by AI" : SAMPLE_WORDING_LABEL;
}

/** Badge for a conversation item's state; only the AI-draft state depends on provenance. */
export function clarificationDraftLabel(state: ConversationItem["state"], provenance: ModelProvenance): string {
  if (state === "suggested_by_ai" && !provenance.modelMade) return SAMPLE_WORDING_LABEL;
  return STATE_LABEL[state];
}
