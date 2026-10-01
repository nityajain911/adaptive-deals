import { FixedClock } from "@/domain/clock";
import { runConstruct, type RunOutcome } from "@/ai/orchestrator";
import { SyntheticAuthoredProvider } from "@/ai/synthetic-provider";
import { heroDeal } from "@/data/synthetic/hero-run";
import type { EvalCase } from "./gold";

/**
 * Runs a development case through the real pipeline using its hand-written reference extraction
 * as the "model" output. This checks labels and deterministic code — it is NOT a model result
 * and must never be reported as one.
 */
export async function runOracle(c: EvalCase): Promise<RunOutcome> {
  if (!c.referenceExtraction) throw new Error(`${c.id} has no reference extraction`);
  const provider = new SyntheticAuthoredProvider({ extract: c.referenceExtraction }, []);
  const base = heroDeal();
  return runConstruct({
    provider,
    kind: "synthetic_replay",
    runId: `oracle-${c.id}`,
    clock: new FixedClock(),
    deal: { ...base, dealId: c.id, messages: c.messages.map((m) => ({ ...m, dealId: c.id })) },
  });
}

export function goldComparable(out: RunOutcome) {
  const p = out.profile;
  const stated = <T>(f: { status: string; value: T | null }) => (f.status === "stated" ? f.value : null);
  return {
    fields: {
      budgetNow: stated(p.budgetNow),
      nextBudget: stated(p.nextBudget)?.available ?? null,
      approvalLimitPaise: stated(p.approvalLimit)?.amountPaise ?? null,
      approvalScope: stated(p.approvalScope),
      amountsIncludeGst: stated(p.amountsIncludeGst),
      latestStart: stated(p.latestStart),
    },
    requiredClarifications: out.questions.map((q) => q.field).sort(),
    expectedState: out.record.engine.initial.state,
    suspectedInstruction: p.suspectedInstructions.length > 0,
    unsupportedKinds: p.outsideTemplateRequests.filter((o) => !o.representable).map((o) => o.kind).sort(),
  };
}
