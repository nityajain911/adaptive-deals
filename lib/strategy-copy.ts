import type { ExplanationResult } from "@/ai/explain";
import type { ModelProvenance } from "./model-provenance";

/**
 * Who did what, on the offer card. Code ranks the offers and writes the explanation, so neither
 * is credited to a model. The merchant is credited for the strategy they chose and for an offer
 * they selected themselves.
 */
export function strategyAttribution(args: { strategyChosen: boolean; selectedByMerchant: boolean; branchCause?: string }): string {
  const base = args.selectedByMerchant
    ? "You chose this offer."
    : args.strategyChosen
      ? "Suggested for what matters most to you."
      : "Suggested for the default priority: earning the most.";
  // A recalculation names its cause.
  return args.branchCause ? `Worked out again after ${args.branchCause}. ${base}` : base;
}

/**
 * The recorded run's order and reason, kept as history. It describes the economics the run was
 * recorded under, so it is shown only while the deal still has them, and it never drives the
 * recommendation.
 */
export function recordedEvidence(args: {
  exp: ExplanationResult | null;
  provenance: ModelProvenance;
  matchesRecording: boolean;
  shownId: string;
  headline: (structureId: string) => string;
}): { heading: string; order: string | null; reason: string | null } | null {
  const { exp, provenance } = args;
  if (!exp || !args.matchesRecording) return null;
  const ordered = exp.source.ranking === "ai";
  const reason = exp.notes.find((n) => n.structureId === args.shownId)?.text ?? null;
  if (!ordered && !reason) return null;
  const model = provenance.modelMade;
  return {
    heading: model
      ? `Historical evidence from the recorded ${provenance.providerName} run. It does not drive the current recommendation.`
      : "Sample order and reason written by hand · no model ran. They do not drive the current recommendation.",
    order: ordered ? `${model ? "Recorded" : "Sample"} order: ${exp.order.map(args.headline).join(" → ")}` : null,
    reason,
  };
}
