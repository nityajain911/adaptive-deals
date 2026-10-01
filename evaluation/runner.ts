import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { FixedClock } from "@/domain/clock";
import { runConstruct, type RunOutcome } from "@/ai/orchestrator";
import { PROMPTS, promptHash } from "@/ai/prompts";
import type { ModelProvider } from "@/ai/provider";
import { heroDeal } from "@/data/synthetic/hero-run";
import { DATASET_DIRS, type EvalCase } from "./gold";
import { aggregate, scoreCase, type CaseResult, type MetricCounts } from "./metrics";
import { goldComparable, runOracle } from "./oracle";

export type EvalMode = "live_model" | "reference_extraction";

export function observe(out: RunOutcome) {
  const structures = out.evaluation.result?.structures ?? [];
  return {
    ...goldComparable(out),
    rejectedFieldCount: out.profile.rejectedFields.length,
    approvableNonFeasible: structures.filter((x) => x.approvable && x.verdict !== "feasible").length,
    structuresGenerated: structures.length,
  };
}

/** Run cases through the real pipeline. Only "live_model" results describe model performance. */
export async function runCases(cases: EvalCase[], mode: EvalMode, provider?: ModelProvider): Promise<{ mode: EvalMode; results: CaseResult[]; counts: MetricCounts }> {
  const results: CaseResult[] = [];
  for (const c of cases) {
    let out: RunOutcome;
    if (mode === "reference_extraction") out = await runOracle(c);
    else {
      if (!provider) throw new Error("A live model provider is required");
      out = await runConstruct({ provider, kind: "live", runId: `eval-${c.id}`, clock: new FixedClock(), deal: { ...heroDeal(), dealId: c.id, messages: c.messages.map((m) => ({ ...m, dealId: c.id })) } });
    }
    results.push(scoreCase(c, observe(out)));
  }
  return { mode, results, counts: aggregate(results) };
}

// ── Frozen-set controls ─────────────────────────────────────────────────────

export const FREEZE_FILE = path.join(DATASET_DIRS.frozen, "FREEZE.json");

export interface FreezeRecord {
  frozenAt: string;
  labelledBy: string;
  caseIds: string[];
  casesHash: string;
  promptVersions: Record<string, string>;
  promptHashes: Record<string, string>;
}

export const currentPromptHashes = () => Object.fromEntries(Object.entries(PROMPTS).map(([k, p]) => [k, promptHash(p)]));

export function casesHash(cases: EvalCase[]): string {
  return createHash("sha256").update(JSON.stringify(cases.map((c) => [c.id, c.messages, c.gold])), "utf8").digest("hex");
}

/** Reasons a frozen run must not happen. Empty = allowed. */
export function frozenRunBlockers(cases: EvalCase[], liveAvailable: boolean): string[] {
  const out: string[] = [];
  if (cases.length < 15 || cases.length > 20) out.push(`Frozen set must have 15–20 cases supplied by another person (found ${cases.length})`);
  if (!existsSync(FREEZE_FILE)) out.push("Prompts are not frozen: run `npm run eval:frozen -- --freeze --labelled-by \"<name>\"` after importing cases");
  else {
    const f = JSON.parse(readFileSync(FREEZE_FILE, "utf8")) as FreezeRecord;
    if (JSON.stringify(f.promptHashes) !== JSON.stringify(currentPromptHashes())) out.push("Prompts changed since the freeze: a fresh, untouched test set is required");
    if (f.casesHash !== casesHash(cases)) out.push("Frozen cases changed after the freeze");
  }
  if (!liveAvailable) out.push("A live model is required (ANTHROPIC_API_KEY); frozen results are never produced from replay or reference extractions");
  return out;
}
