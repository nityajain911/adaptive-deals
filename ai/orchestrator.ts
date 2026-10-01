import { canonicalJson } from "@/domain/agreement";
import type { Clock, ClockAdvance } from "@/domain/clock";
import { applyClarificationAnswer, type ClarifiableField } from "@/domain/constraints";
import type { DateValue } from "@/domain/dates";
import { evaluateDeal, type DealEvaluation, type EngineInput } from "@/domain/engine";
import type { ApprovalScope, ConstraintProfile, GstInclusion, Merchant, Message, ServicePackage, TemplateConfig } from "@/domain/types";
import { buildClarificationRequest, interpretClarification, type ClarificationQuestion } from "./clarify";
import { buildExplanationRequest, aliasOptions, interpretExplanation, type ExplanationResult } from "./explain";
import { buildExtractionRequest, interpretExtraction } from "./extract";
import { promptFor, promptHash } from "./prompts";
import type { AiTask } from "./schemas";
import type { ModelProvider, ProviderResult, StructuredRequest } from "./provider";
import { ReplayProvider } from "./replay-provider";
import { profileCards, RUN_RECORD_SCHEMA, snapshotEvaluation, type RecordedAnswer, type RunKind, type RunRecord, type RunStep } from "./run-record";

export interface DealContext {
  dealId: string;
  messages: Message[];
  merchant: Merchant;
  packages: ServicePackage[];
  templates: TemplateConfig;
}

export interface RunOutcome {
  record: RunRecord;
  profile: ConstraintProfile;
  evaluation: DealEvaluation;
  questions: ClarificationQuestion[];
  explanation: ExplanationResult | null;
}

export class AnswerError extends Error {}

/**
 * One continuous Construct run: extract → engine → (clarify) → answers → engine → explain.
 * Steps already present in `previous` (same run, same exact input) are reused rather than
 * re-requested, so continuing a run after the merchant records answers never mixes runs.
 */
export async function runConstruct(args: {
  provider: ModelProvider;
  kind: RunKind;
  runId: string;
  clock: Clock;
  deal: DealContext;
  answers?: RecordedAnswer[];
  previous?: RunRecord;
  recordedAtWall?: string | null;
  clockAdvances?: ClockAdvance[];
  /** Prompt versions to use; defaults to a continued run's own versions, else the current ones. */
  promptVersions?: Partial<Record<AiTask, string>>;
}): Promise<RunOutcome> {
  const { deal, provider } = args;
  if (args.previous && args.previous.runId !== args.runId) throw new Error("A run can only be continued under its own run ID");
  const reuse = new Map((args.previous?.steps ?? []).map((s) => [s.inputHash, s]));
  const versions = args.promptVersions ?? args.previous?.promptVersions;
  const prompts = { extract: promptFor("extract", versions?.extract), clarify: promptFor("clarify", versions?.clarify), explain: promptFor("explain", versions?.explain) };
  const steps: RunStep[] = [];
  const engine: EngineInput = { merchant: deal.merchant, packages: deal.packages, templates: deal.templates };

  const call = async (req: StructuredRequest): Promise<{ raw: unknown | null; step: RunStep }> => {
    const prior = reuse.get(req.inputHash);
    const res: ProviderResult = prior
      ? prior.failure
        ? { ok: false, failure: prior.failure.kind, message: prior.failure.message, meta: { provider: prior.provider, model: prior.model, temperature: prior.temperature } }
        : { ok: true, raw: prior.rawOutput, meta: { provider: prior.provider, model: prior.model, temperature: prior.temperature } }
      : await provider.generate(req);
    const step: RunStep = {
      task: req.task,
      promptVersion: req.prompt.version,
      promptHash: promptHash(req.prompt),
      inputHash: req.inputHash,
      userContent: req.user,
      provider: res.meta.provider,
      model: res.meta.model,
      temperature: res.meta.temperature,
      rawOutput: res.ok ? res.raw : (res.raw ?? null),
      outcome: res.ok ? "accepted" : "failed",
      failure: res.ok ? null : { kind: res.failure, message: res.message },
      issues: [],
    };
    steps.push(step);
    return { raw: res.ok ? res.raw : null, step };
  };

  // 1. Extraction: AI returns raw text + evidence; code verifies and normalises.
  const ex = await call(buildExtractionRequest(deal.messages, deal.packages, prompts.extract));
  const extraction = ex.raw === null ? null : interpretExtraction(ex.raw, { dealId: deal.dealId, messages: deal.messages, packages: deal.packages, timeZone: deal.merchant.timeZone });
  let profile: ConstraintProfile = extraction?.profile ?? interpretExtraction(null, { dealId: deal.dealId, messages: deal.messages, packages: deal.packages, timeZone: deal.merchant.timeZone }).profile;
  if (extraction && !extraction.accepted) {
    ex.step.outcome = "rejected";
    ex.step.issues = extraction.issues;
  } else if (extraction && profile.rejectedFields.length) {
    ex.step.outcome = "accepted_with_corrections";
    ex.step.issues = profile.rejectedFields.map((r) => `field ${r.key} rejected: ${r.reason}`);
  }
  const extractionUsable = ex.step.outcome === "accepted" || ex.step.outcome === "accepted_with_corrections";

  // 2. Engine: full evaluation of every interpretation.
  const initial = evaluateDeal(profile, engine);
  let questions: ClarificationQuestion[] = [];
  if (initial.state === "ambiguous") {
    const req = buildClarificationRequest(profile, initial.ambiguities, prompts.clarify);
    const cl = await call(req);
    const result = interpretClarification(cl.raw, profile, initial.ambiguities);
    questions = result.questions;
    if (cl.raw !== null) {
      cl.step.issues = result.issues;
      if (result.questions.some((q) => q.wording === "code_fallback")) cl.step.outcome = result.questions.every((q) => q.wording === "code_fallback") ? "rejected" : "accepted_with_corrections";
    }
  }

  // 3. Merchant-recorded, buyer-confirmed answers.
  const answers = args.answers ?? [];
  for (const a of answers) {
    const q = questions.find((x) => x.id === a.questionId);
    if (!q) throw new AnswerError(`Answer ${a.questionId} does not match a question asked in run ${args.runId}`);
    profile = applyClarificationAnswer(profile, q.field, toAnswerValue(q.field, a.value), {
      clarificationId: q.id,
      question: q.question,
      answerText: a.answerText,
      recordedBy: a.recordedBy,
      confirmedByBuyerVia: a.confirmedByBuyerVia,
      answeredAt: a.answeredAt,
      coversAmounts: q.covers,
    });
  }
  const final = answers.length ? evaluateDeal(profile, engine) : initial;

  // 4. Explanation of engine-feasible structures only.
  let explanation: ExplanationResult | null = null;
  if (final.state === "options_ready" && final.result) {
    const options = aliasOptions(final.result.feasible);
    const exp = await call(buildExplanationRequest(options, prompts.explain));
    explanation = interpretExplanation(exp.raw, final.result.feasible);
    if (exp.raw !== null) {
      exp.step.issues = explanation.issues;
      if (explanation.source.text === "code_fallback" || explanation.issues.length) exp.step.outcome = explanation.source.text === "code_fallback" && explanation.source.ranking === "code" ? "rejected" : "accepted_with_corrections";
    }
  }

  const status: RunRecord["status"] = !extractionUsable ? "needs_review" : final.state === "ambiguous" ? "awaiting_clarification" : "complete";
  const meta = steps.find((s) => s.failure === null) ?? steps[0];
  const record: RunRecord = {
    schema: RUN_RECORD_SCHEMA,
    runId: args.runId,
    kind: args.kind,
    status,
    createdAt: args.previous?.createdAt ?? args.clock.now(),
    recordedAtWall: args.previous?.recordedAtWall ?? args.recordedAtWall ?? null,
    provider: meta?.provider ?? provider.name,
    model: meta?.model ?? provider.model,
    promptVersions: { extract: prompts.extract.version, clarify: prompts.clarify.version, explain: prompts.explain.version },
    inputs: { dealId: deal.dealId, messages: deal.messages, packageIds: deal.packages.map((p) => p.id), policy: deal.merchant.policy, answers },
    steps,
    engine: {
      profile: profileCards(profile),
      derivedBudgetGap: profile.derivedBudgetGap,
      rejectedFields: profile.rejectedFields,
      suspectedInstructions: profile.suspectedInstructions,
      initial: snapshotEvaluation(initial),
      final: answers.length ? snapshotEvaluation(final) : initial.state === "ambiguous" ? null : snapshotEvaluation(initial),
    },
    displayed: { questions, explanation: explanation ? { order: explanation.order, comparisonTemplate: explanation.comparisonTemplate, comparison: explanation.comparison, notes: explanation.notes, source: explanation.source, issues: explanation.issues } : null },
    clockAdvances: args.clockAdvances ?? args.previous?.clockAdvances ?? [],
  };
  return { record, profile, evaluation: final, questions, explanation };
}

function toAnswerValue(field: ClarifiableField, value: string): GstInclusion | ApprovalScope | DateValue {
  if (field === "amountsIncludeGst") {
    if (value !== "yes" && value !== "no") throw new AnswerError("GST answer must be yes or no");
    return value;
  }
  if (field === "approvalScope") {
    if (value !== "per_payment" && value !== "per_contract") throw new AnswerError("Approval answer must be per_payment or per_contract");
    return value;
  }
  if (/^\d{4}-\d{2}$/.test(value)) return { value, precision: "month" };
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { value, precision: "day" };
  throw new AnswerError("Next-budget answer must be YYYY-MM or YYYY-MM-DD");
}

export class ReplayIntegrityError extends Error {}

/**
 * Replay a stored run from its own raw outputs only, and verify that code reproduces exactly
 * what was stored. Any missing step, foreign step or changed engine result refuses the replay.
 */
export async function replayRun(record: RunRecord, deal: DealContext, clock: Clock): Promise<RunOutcome> {
  if (record.inputs.dealId !== deal.dealId || canonicalJson(record.inputs.messages) !== canonicalJson(deal.messages)) {
    throw new ReplayIntegrityError("Stored run inputs do not match this deal");
  }
  const provider = new ReplayProvider(record.kind === "live" ? "recorded_replay" : "synthetic_replay", record.model, record.steps);
  // The stored run is the only source of model output: its steps (including recorded failures)
  // are reused; any request it never made reaches the replay provider and is refused.
  let out: RunOutcome;
  try {
    out = await runConstruct({ provider, kind: record.kind, runId: record.runId, clock, deal: { ...deal, merchant: { ...deal.merchant, policy: record.inputs.policy } }, answers: record.inputs.answers, previous: record });
  } catch (e) {
    throw new ReplayIntegrityError(`Stored run cannot be replayed: ${e instanceof Error ? e.message : String(e)}`);
  }
  const failed = out.record.steps.filter((s) => s.failure?.kind === "replay_mismatch");
  if (failed.length) throw new ReplayIntegrityError(`Replay needed outputs this run never produced (${failed.map((s) => s.task).join(", ")})`);
  if (out.record.steps.length !== record.steps.length) throw new ReplayIntegrityError("Replay step count differs from the stored run");
  for (const k of ["engine", "displayed"] as const) {
    if (canonicalJson(out.record[k]) !== canonicalJson(record[k])) throw new ReplayIntegrityError(`Replayed ${k} differs from the stored run`);
  }
  return { ...out, record: { ...out.record, provider: record.provider, model: record.model, createdAt: record.createdAt, recordedAtWall: record.recordedAtWall } };
}
