import type { RunOutcome, DealContext } from "@/ai/orchestrator";
import type { RecordedAnswer, RunRecord } from "@/ai/run-record";
import { interpretExplanation } from "@/ai/explain";
import { canonicalJson } from "@/domain/agreement";
import { applyClarificationAnswer, type ClarifiableField } from "@/domain/constraints";
import type { DateValue } from "@/domain/dates";
import { evaluateDeal } from "@/domain/engine";
import type { ApprovalScope, GstInclusion } from "@/domain/types";

export const DECISION_BRANCH_SCHEMA = "adaptive-deals.decision-branch.v1" as const;

export interface DecisionBranch {
  schema: typeof DECISION_BRANCH_SCHEMA;
  branchId: string;
  parentRunId: string;
  createdAt: string;
  answers: RecordedAnswer[];
  reason: "changed_clarification_answers";
  explanationSource: "code_fallback";
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
 * Re-evaluate changed clarification answers without fabricating a new model step.
 * The parent record remains the immutable evidence for extraction and question wording;
 * the domain engine and the documented code fallback own the branch decision.
 */
export function deriveBranchOutcome(args: { initial: RunOutcome; branch: DecisionBranch; deal: DealContext }): RunOutcome {
  const { initial, branch, deal } = args;
  if (branch.schema !== DECISION_BRANCH_SCHEMA) throw new Error("Unsupported decision branch schema");
  if (branch.parentRunId !== initial.record.runId) throw new Error("Decision branch does not belong to this run");

  let profile = structuredClone(initial.profile);
  for (const answer of branch.answers) {
    const question = initial.questions.find((candidate) => candidate.id === answer.questionId);
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
    questions: initial.questions,
    explanation,
  };
}
