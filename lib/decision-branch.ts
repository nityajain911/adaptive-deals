import type { RunOutcome, DealContext } from "@/ai/orchestrator";
import type { RecordedAnswer, RunRecord } from "@/ai/run-record";
import { interpretExplanation } from "@/ai/explain";
import { interpretClarification } from "@/ai/clarify";
import { canonicalJson } from "@/domain/agreement";
import { applyClarificationAnswer, type ClarifiableField } from "@/domain/constraints";
import type { DateValue } from "@/domain/dates";
import { evaluateDeal } from "@/domain/engine";
import type { ApprovalScope, GstInclusion } from "@/domain/types";
import { applyScopeConfirmation, type ScopeConfirmation } from "./scope-confirmation";

export const DECISION_BRANCH_SCHEMA_V1 = "adaptive-deals.decision-branch.v1" as const;
export const DECISION_BRANCH_SCHEMA_V2 = "adaptive-deals.decision-branch.v2" as const;
export const DECISION_BRANCH_SCHEMA = DECISION_BRANCH_SCHEMA_V2;

/**
 * A decision the engine recalculated from inputs the recorded model run did not process: changed
 * clarification answers, a merchant's confirmation of required services, or both. The parent run
 * stays immutable evidence; code and the engine own the branch decision and its explanation.
 */
export interface DecisionBranch {
  schema: typeof DECISION_BRANCH_SCHEMA_V1 | typeof DECISION_BRANCH_SCHEMA_V2;
  branchId: string;
  parentRunId: string;
  createdAt: string;
  /** The answers governing this decision. For a scope-only branch these are the parent run's own. */
  answers: RecordedAnswer[];
  reason: "changed_clarification_answers" | "merchant_scope_confirmation" | "economics_changed";
  /** True when `answers` differ from the parent run's. Branches stored before scope confirmation are answer branches. */
  answersChanged?: boolean;
  scope?: ScopeConfirmation | null;
  economics?: { version: number; effectiveHash: string };
  explanationSource: "code_fallback";
}

export const branchChangedAnswers = (branch: Pick<DecisionBranch, "answersChanged">) => branch.answersChanged !== false;
export const branchScope = (branch: Pick<DecisionBranch, "scope">) => branch.scope ?? null;

/** What caused the recalculation, for the Offer card attribution. */
export function branchCause(branch: Pick<DecisionBranch, "answersChanged" | "scope" | "economics">): string {
  const answers = branchChangedAnswers(branch);
  const scope = branchScope(branch) !== null;
  if (!answers && !scope && branch.economics) return "the merchant changed the deal's prices & costs";
  if (answers && scope) return "the buyer's answers and the merchant's confirmation of the services";
  return scope ? "the merchant confirmed the services" : "the buyer's answer";
}

/** What the parent run did not process: the inputs a branch recalculates from. */
export function branchNotProcessed(branch: Pick<DecisionBranch, "answersChanged" | "scope" | "economics">): string {
  const answers = branchChangedAnswers(branch);
  const scope = branchScope(branch) !== null;
  if (!answers && !scope && branch.economics) return "the changed prices & costs";
  if (answers && scope) return "the changed answers and the merchant-confirmed services";
  return scope ? "the merchant-confirmed services" : "the changed answers";
}

/** The audit's description of what the engine recalculated after. */
export function branchRecalculatedAfter(branch: Pick<DecisionBranch, "answersChanged" | "scope" | "economics">): string {
  const answers = branchChangedAnswers(branch);
  const scope = branchScope(branch) !== null;
  if (!answers && !scope && branch.economics) return "the merchant changed the prices & costs";
  if (answers && scope) return "the changed buyer answers and the merchant's confirmed services";
  return scope ? "the merchant confirmed the required services" : "the changed buyer answers";
}

function canonicalAnswer(answer: RecordedAnswer) {
  return {
    questionId: answer.questionId,
    value: answer.value,
    answerText: answer.answerText,
    recordedBy: answer.recordedBy,
    confirmedByBuyerVia: answer.confirmedByBuyerVia,
    answeredAt: answer.answeredAt,
  };
}

export function canonicalAnswers(answers: RecordedAnswer[]): string {
  return canonicalJson([...answers].sort((a, b) => a.questionId.localeCompare(b.questionId)).map(canonicalAnswer));
}

export function answersMatchRecorded(source: { inputs: Pick<RunRecord["inputs"], "answers"> }, answers: RecordedAnswer[]): boolean {
  return canonicalAnswers(source.inputs.answers) === canonicalAnswers(answers);
}

function answerValue(field: ClarifiableField, value: string): GstInclusion | ApprovalScope | DateValue {
  if (field === "amountsIncludeGst") {
    if (value !== "yes" && value !== "no") throw new Error("GST answer must be yes or no");
    return value;
  }
  if (field === "approvalScope") {
    if (value !== "per_contract" && value !== "per_payment") throw new Error("Approval answer must be per_contract or per_payment");
    return value;
  }
  if (/^\d{4}-\d{2}$/.test(value)) return { value, precision: "month" };
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { value, precision: "day" };
  throw new Error("Next-budget answer must be YYYY-MM or YYYY-MM-DD");
}

/**
 * Re-evaluate changed inputs without fabricating a new model step.
 * The parent record remains the immutable evidence for extraction and question wording;
 * the domain engine and the documented code fallback own the branch decision.
 */
export function deriveBranchOutcome(args: { initial: RunOutcome; branch: DecisionBranch; deal: DealContext }): RunOutcome {
  const { initial, branch, deal } = args;
  if (branch.schema !== DECISION_BRANCH_SCHEMA_V1 && branch.schema !== DECISION_BRANCH_SCHEMA_V2) throw new Error("Unsupported decision branch schema");
  if (branch.parentRunId !== initial.record.runId) throw new Error("Decision branch does not belong to this run");

  let profile = structuredClone(initial.profile);
  const beforeAnswers = evaluateDeal(profile, { merchant: deal.merchant, packages: deal.packages, templates: deal.templates });
  const codeQuestions = beforeAnswers.state === "ambiguous"
    ? interpretClarification(null, profile, beforeAnswers.ambiguities).questions
    : [];
  const questions = codeQuestions.map((question) => {
    const recorded = initial.questions.find((candidate) => candidate.id === question.id);
    return recorded ? { ...question, question: recorded.question, wording: recorded.wording } : question;
  });
  for (const answer of branch.answers) {
    // Under other economics a question may no longer change the outcome and so is no longer asked. The buyer's
    // answer is still what they said, so it is applied through the question the parent run asked.
    const question = questions.find((candidate) => candidate.id === answer.questionId) ?? initial.questions.find((candidate) => candidate.id === answer.questionId);
    if (!question) throw new Error(`Answer ${answer.questionId} does not match a parent clarification question`);
    profile = applyClarificationAnswer(profile, question.field, answerValue(question.field, answer.value), {
      clarificationId: question.id,
      question: question.question,
      answerText: answer.answerText,
      recordedBy: answer.recordedBy,
      confirmedByBuyerVia: answer.confirmedByBuyerVia,
      answeredAt: answer.answeredAt,
      coversAmounts: question.covers,
    });
  }

  const scope = branchScope(branch);
  if (scope) profile = applyScopeConfirmation(profile, scope, deal.messages, deal.packages);

  const evaluation = evaluateDeal(profile, {
    merchant: deal.merchant,
    packages: deal.packages,
    templates: deal.templates,
  });
  const explanation =
    evaluation.state === "options_ready" && evaluation.result
      ? interpretExplanation(null, evaluation.result.feasible, initial.record.promptVersions.explain)
      : null;

  return {
    record: initial.record,
    profile,
    evaluation,
    questions,
    explanation,
  };
}
