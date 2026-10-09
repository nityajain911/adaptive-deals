/**
 * Final recorded runs for the three commercial cases (judge-proof spec §8.3).
 *
 * Runs each case once through the real orchestrator and engine with the live provider, calling
 * only the tasks that case's own run chain reaches. The first technically valid result of every
 * step is final and is kept as recorded, model misses included. A step is requested again only
 * after a technical failure (transport, timeout, rate limit, malformed provider response), after
 * waiting for the provider's stated retry time. A refusal is a valid model outcome: it is never
 * retried, and the run stops so it can be reported.
 *
 * "Technically valid" means the provider returned output that meets the declared output schema
 * (see `recording-policy.ts`). Well-formed JSON that breaks the schema is a schema failure: the
 * rejected attempt is preserved in the report and the step is requested again, within a strict
 * budget. A prose-rule violation is not a schema failure; the product keeps its code fallback.
 *
 * The only non-model input is the simulated buyer's scripted answer to a clarification question
 * the chain itself asked. Records are written to the git-ignored data directory; copying an
 * accepted record into `data/case-recorded-runs/` is a separate, deliberate step.
 *
 *   npx tsx --conditions=react-server --env-file=<path to .env.local> scripts/record-case-runs.ts [--dry] [--only=<case id>]
 *   ... --only=<case id> --supersede=<run id> --rerun-step=<task> --max-model-outputs=1
 *       Rebuilds one case. The named step of the earlier run, which failed its schema, is moved to
 *       the report as a rejected attempt and requested once more. Every other step of that case
 *       is reused from its first valid output, unchanged, with no call.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { runConstruct, type RunOutcome } from "@/ai/orchestrator";
import { KEY_VARS } from "@/ai/config";
import type { ModelProvider } from "@/ai/provider";
import type { AiTask } from "@/ai/schemas";
import { FixedClock } from "@/domain/clock";
import { CASE_IDS, demoCase, type CaseId } from "@/data/synthetic/cases";
import { defaultOptions, newLedger, RecordingProvider, Stop, type Ledger } from "./recording-provider";
import { recordingProviderFromFreeze, type RecordingProviderFreeze } from "./recording-live-provider";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
type CaseRecordingFreeze = RecordingProviderFreeze & {
  scope: CaseId[];
  maximumProviderRequests: number;
  networkCallsMade: number;
};

const freeze = JSON.parse(readFileSync(path.join(process.cwd(), "data/synthetic/CASE_RECORDING_FREEZE.json"), "utf8")) as CaseRecordingFreeze;
const options = defaultOptions(Number(arg("max-model-outputs") ?? 6), freeze.maximumProviderRequests);

function summarise(caseId: CaseId, out: RunOutcome, answered: string[]) {
  const item = demoCase(caseId)!;
  const record = out.record;
  const final = record.engine.final ?? record.engine.initial;
  const top = out.explanation ? final.structures.find((s) => s.id === out.explanation!.order[0]) : null;
  const raw = record.steps.find((s) => s.task === "extract" && s.failure === null)?.rawOutput as { fields?: { key: string; raw_text: string; evidence_quote: string; message_id: string }[]; ambiguities?: { field_key: string }[] } | undefined;
  return {
    caseId,
    runId: record.runId,
    status: record.status,
    steps: record.steps.map((s) => ({ task: s.task, promptVersion: s.promptVersion, promptHash: s.promptHash.slice(0, 16), inputHash: s.inputHash.slice(0, 16), provider: s.provider, model: s.model, outcome: s.outcome, failure: s.failure, issues: s.issues })),
    rawFields: raw?.fields ?? null,
    rawAmbiguities: raw?.ambiguities?.map((a) => a.field_key) ?? null,
    profile: record.engine.profile.filter((f) => f.status !== "missing").map((f) => ({ field: f.label, status: f.status, value: f.display, evidence: f.evidence.map((e) => `${e.messageId}: “${e.quote}”`), note: f.note })),
    rejectedFields: record.engine.rejectedFields,
    engine: { initial: record.engine.initial.state, final: record.engine.final?.state ?? null, feasible: final.feasibleOrder.map((id) => final.structures.find((s) => s.id === id)).map((s) => (s ? `${s.label} [${s.template}; ${s.approval}]` : "?")) },
    questions: record.displayed.questions.map((q) => ({ id: q.id, wording: q.wording, question: q.question })),
    answeredWithScriptedBuyerReply: answered,
    explanation: out.explanation ? { source: out.explanation.source, issues: out.explanation.issues, rankedFirst: top ? `${top.label} [${top.template}]` : null, notes: out.explanation.notes } : null,
    caseCard: { expectedState: item.expected.engineState, expectedTemplate: item.expected.recommendedTemplate, actualState: final.state, actualTemplate: top?.template ?? null, agrees: final.state === item.expected.engineState && (top?.template ?? null) === item.expected.recommendedTemplate },
  };
}

/** The superseded run's stored step for a task, when this invocation is a rerun. */
function supersededStep(dir: string, runId: string, task: AiTask) {
  const file = path.join(dir, `${runId}.json`);
  if (!existsSync(file)) throw new Error(`Superseded run not found: ${file}`);
  const earlier = JSON.parse(readFileSync(file, "utf8")) as RunOutcome["record"];
  const step = earlier.steps.find((s) => s.task === task);
  if (!step) throw new Error(`Run ${runId} has no ${task} step`);
  if (step.outcome !== "rejected" || !step.issues.some((i) => i.startsWith("schema:"))) throw new Error(`The ${task} step of ${runId} did not fail its schema (outcome ${step.outcome}); refusing to rerun it`);
  return step;
}

async function record(caseId: CaseId, live: ModelProvider, ledger: Ledger, dir: string, rerun: { runId: string; task: AiTask } | null) {
  const item = demoCase(caseId)!;
  const provider = new RecordingProvider(live, caseId, ledger, path.join(dir, `first-valid-outputs-${live.name}-${caseId}.json`), rerun ? { [rerun.task]: 1 } : {}, options);
  if (rerun) {
    // The earlier attempt is preserved in the report, struck from the reusable outputs, and counted
    // against the rerun budget; every other step of the case is reused unchanged.
    const step = supersededStep(dir, rerun.runId, rerun.task);
    provider.strike(step.inputHash);
    ledger.rejectedAttempts.push({ caseId, task: rerun.task, inputHash: step.inputHash, supersededRunId: rerun.runId, reason: step.issues.join("; "), rawOutput: step.rawOutput });
  }
  const runId = `run-case-${caseId}-${randomUUID().slice(0, 8)}`;
  const base = { provider, kind: "live" as const, runId, clock: new FixedClock(), deal: item.deal, recordedAtWall: new Date().toISOString() };
  let out = await runConstruct(base);
  const answered: string[] = [];
  if (out.record.status === "awaiting_clarification") {
    const asked = out.record.displayed.questions;
    const scripted = asked.map((q) => item.expected.recordedAnswers.find((a) => a.questionId === q.id) ?? null);
    const unanswerable = asked.filter((_, i) => scripted[i] === null).map((q) => q.id);
    if (unanswerable.length) throw new Stop(`${caseId}: the run asked a question with no scripted buyer answer (${unanswerable.join(", ")}). Stopping; no answer was guessed.`);
    answered.push(...asked.map((q) => q.id));
    out = await runConstruct({ ...base, answers: scripted as NonNullable<(typeof scripted)[number]>[], previous: out.record });
  }
  return { out, summary: summarise(caseId, out, answered) };
}

async function main() {
  if (freeze.networkCallsMade !== 0) throw new Error("Recording freeze no longer represents a pre-call checkpoint");
  const live = recordingProviderFromFreeze(freeze);
  console.log(`Provider: ${live.name} · model: ${live.model} · model-output cap: ${options.modelOutputCap} · provider-request cap: ${options.requestCap}`);
  const only = arg("only");
  const rerunTask = arg("rerun-step") as AiTask | undefined;
  const supersede = arg("supersede");
  if (Boolean(rerunTask) !== Boolean(supersede) || (rerunTask && !only)) throw new Error("--rerun-step, --supersede and --only must be given together");
  const rerun = rerunTask && supersede ? { runId: supersede, task: rerunTask } : null;
  const selected = only ? CASE_IDS.filter((id) => id === only) : [...CASE_IDS];
  if (only && selected.length === 0) throw new Error(`Unknown case: ${only}`);
  if (selected.some((id) => !freeze.scope.includes(id))) throw new Error(`Recording freeze authorises only: ${freeze.scope.join(", ")}`);
  if (process.argv.includes("--dry")) {
    if (rerun) {
      const step = supersededStep(path.join(process.env.ADAPTIVE_DEALS_DATA_DIR || path.join(process.cwd(), ".data"), "runs"), rerun.runId, rerun.task);
      console.log(`Rerun is valid: the ${rerun.task} step of ${rerun.runId} failed its schema (${step.issues.join("; ")}).`);
    }
    return console.log(`Dry run: configuration is valid; would record ${selected.join(", ")}${rerun ? ` (rerunning ${rerun.task} once)` : ""}. No call made.`);
  }

  const ledger = newLedger();
  const apiKey = process.env[KEY_VARS[freeze.provider]]!.trim();
  const dir = path.join(process.env.ADAPTIVE_DEALS_DATA_DIR || path.join(process.cwd(), ".data"), "runs");
  mkdirSync(dir, { recursive: true });

  const summaries = [];
  let stopped: string | null = null;
  for (const caseId of selected) {
    try {
      const { out, summary } = await record(caseId, live, ledger, dir, rerun);
      const text = JSON.stringify(out.record, null, 2);
      if (text.includes(apiKey)) throw new Error("Refusing to write a record that contains the API key");
      writeFileSync(path.join(dir, `${out.record.runId}.json`), text + "\n");
      summaries.push(summary);
    } catch (error) {
      if (!(error instanceof Stop)) throw error;
      stopped = `${caseId}: ${error.message}`;
      break;
    }
  }
  const report = { recordedAt: new Date().toISOString(), provider: live.name, model: live.model, requestCap: options.requestCap, requests: ledger.requests, retries: ledger.retries, rejectedAttempts: ledger.rejectedAttempts, supersedes: rerun?.runId ?? null, summaries, stopped };
  const reportText = JSON.stringify(report, null, 2);
  if (reportText.includes(apiKey)) throw new Error("Refusing to write a report that contains the API key");
  writeFileSync(path.join(dir, `final-recording-report-${live.name}${only ? `-${only}` : ""}${rerun ? "-rerun" : ""}.json`), reportText + "\n");
  console.log(reportText);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
