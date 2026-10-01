import type { ClockAdvance } from "@/domain/clock";
import { failingChecks, featuredRejections, type DealEvaluation } from "@/domain/engine";
import { formatDate, formatDateValue } from "@/domain/dates";
import { formatINR, sum } from "@/domain/money";
import type { ConstraintProfile, Evidence, Message, MerchantPolicy, ProfileField } from "@/domain/types";
import type { ClarificationQuestion } from "./clarify";
import type { ExplanationResult } from "./explain";
import type { ProviderFailureKind, ProviderName } from "./provider";
import type { AiTask } from "./schemas";

export const RUN_RECORD_SCHEMA = "adaptive-deals.run.v1";

/**
 * - synthetic_replay: credential-free bundled run whose AI outputs were written by hand.
 * - live: produced by a real model call and the engine.
 */
export type RunKind = "synthetic_replay" | "live";

export interface RunStep {
  task: AiTask;
  promptVersion: string;
  promptHash: string;
  inputHash: string;
  userContent: string;
  provider: ProviderName;
  model: string;
  temperature: string;
  rawOutput: unknown;
  outcome: "accepted" | "accepted_with_corrections" | "rejected" | "failed";
  failure: { kind: ProviderFailureKind; message: string } | null;
  issues: string[];
}

export interface RecordedAnswer {
  questionId: string;
  value: string;
  answerText: string;
  recordedBy: string;
  confirmedByBuyerVia: "whatsapp" | "email" | "call";
  answeredAt: string;
}

export interface FieldCard {
  key: string;
  label: string;
  status: string;
  display: string | null;
  rawText: string | null;
  evidence: Evidence[];
  transformation: string | null;
  confidence: string;
  note: string | null;
  confirmedBy: { questionId: string; via: string; answeredAt: string } | null;
}

export interface StructureSummary {
  id: string;
  label: string;
  template: string;
  scopeKind: string;
  verdict: string;
  approval: string;
  approvable: boolean;
  failingCodes: string[];
  needsInformationCodes: string[];
  prePaise: number;
  totalPaise: number;
  payments: { dueDate: string; totalPaise: number }[];
  netContributionPaise: number;
  peakFundingPaise: number;
  peakUnpaidServiceValuePaise: number;
}

export interface EvaluationSnapshot {
  state: DealEvaluation["state"];
  missingRequired: string[];
  outsideTemplates: { kind: string; rawText: string; reason: string }[];
  ambiguities: { field: string; decisionRelevant: boolean; readings: string[]; differingStructures: string[]; feasibleCountByReading: Record<string, number>; withinLimitCountByReading: Record<string, number> }[];
  templatesEvaluated: string[];
  structures: StructureSummary[];
  feasibleOrder: string[];
  featured: { buyer: string | null; seller: string | null };
}

export interface RunRecord {
  schema: typeof RUN_RECORD_SCHEMA;
  runId: string;
  kind: RunKind;
  status: "awaiting_clarification" | "complete" | "needs_review";
  /** Demo-clock time of the run (fixed Asia/Kolkata anchor unless advanced). */
  createdAt: string;
  /** Wall-clock time a live run was recorded; null for synthetic replays. */
  recordedAtWall: string | null;
  provider: ProviderName;
  model: string;
  promptVersions: Record<AiTask, string>;
  inputs: {
    dealId: string;
    messages: Message[];
    packageIds: string[];
    policy: MerchantPolicy;
    answers: RecordedAnswer[];
  };
  steps: RunStep[];
  engine: {
    profile: FieldCard[];
    derivedBudgetGap: ConstraintProfile["derivedBudgetGap"];
    rejectedFields: ConstraintProfile["rejectedFields"];
    suspectedInstructions: ConstraintProfile["suspectedInstructions"];
    initial: EvaluationSnapshot;
    final: EvaluationSnapshot | null;
  };
  displayed: {
    questions: ClarificationQuestion[];
    explanation: Omit<ExplanationResult, "options"> | null;
  };
  clockAdvances: ClockAdvance[];
}

export function provenanceLabel(r: Pick<RunRecord, "kind" | "runId">, viewing: "replay" | "fresh"): string {
  if (r.kind === "synthetic_replay") return `Synthetic replay · run ID ${r.runId}`;
  return viewing === "replay" ? `Replay of an actual run · run ID ${r.runId}` : `Live run · run ID ${r.runId}`;
}

function display(f: ProfileField<unknown>): string | null {
  const v = f.value as Record<string, unknown> | string | null;
  if (v === null) return null;
  switch (f.key) {
    case "budgetNow": {
      const b = v as unknown as { amountPaise: number; period: { start: string; end: string } };
      return `${formatINR(b.amountPaise)} available ${formatDate(b.period.start)} – ${formatDate(b.period.end)}`;
    }
    case "nextBudget": {
      const n = v as unknown as { available: { value: string; precision: "day" | "month" }; amountPaise: number | null };
      return `Available from ${formatDateValue(n.available)} (${n.available.precision} precision)${n.amountPaise == null ? "; amount not stated" : `; ${formatINR(n.amountPaise)}`}`;
    }
    case "approvalLimit":
      return `Above ${formatINR((v as unknown as { amountPaise: number }).amountPaise)} needs MD approval`;
    case "approvalScope":
      return v === "per_contract" ? "Applies to the whole contract" : "Applies per payment";
    case "amountsIncludeGst":
      return v === "yes" ? "Amounts include GST" : "Amounts exclude GST";
    case "latestStart":
      return `Start by ${formatDateValue(v as unknown as { value: string; precision: "day" | "month" })}`;
    default:
      return Array.isArray(v) ? v.join(", ") : String(v);
  }
}

export function profileCards(p: ConstraintProfile): FieldCard[] {
  const fields: ProfileField<unknown>[] = [p.budgetNow, p.nextBudget, p.approvalLimit, p.approvalScope, p.amountsIncludeGst, p.latestStart, p.requiredPackages, p.optionalPackages, ...p.otherConstraints];
  return fields.map((f) => ({
    key: f.key,
    label: f.label,
    status: f.status,
    display: display(f),
    rawText: f.rawText,
    evidence: f.evidence,
    transformation: f.transformation,
    confidence: f.confidence,
    note: f.note ?? null,
    confirmedBy: f.clarification ? { questionId: f.clarification.clarificationId, via: f.clarification.confirmedByBuyerVia, answeredAt: f.clarification.answeredAt } : null,
  }));
}

export function snapshotEvaluation(e: DealEvaluation): EvaluationSnapshot {
  const r = e.result;
  const featured = r ? featuredRejections(r) : { buyer: null, seller: null };
  return {
    state: e.state,
    missingRequired: e.missingRequired,
    outsideTemplates: e.outsideTemplates.map((o) => ({ kind: o.kind, rawText: o.rawText, reason: o.reason })),
    ambiguities: e.ambiguities.map((a) => ({ field: a.field, decisionRelevant: a.decisionRelevant, readings: a.readings, differingStructures: a.differences.map((d) => d.structureId), feasibleCountByReading: a.feasibleCountByReading, withinLimitCountByReading: a.withinLimitCountByReading })),
    templatesEvaluated: r?.templatesEvaluated ?? [],
    structures: (r?.structures ?? []).map((x) => ({
      id: x.structure.id,
      label: x.structure.label,
      template: x.structure.template,
      scopeKind: x.structure.scopeKind,
      verdict: x.verdict,
      approval: x.approval,
      approvable: x.approvable,
      failingCodes: failingChecks(x).map((c) => c.code),
      needsInformationCodes: [...x.buyerChecks, ...x.sellerChecks].filter((c) => c.status === "needs_information").map((c) => c.code),
      prePaise: x.structure.pricePaise,
      totalPaise: sum(x.structure.payments.map((p) => p.totalPaise)),
      payments: x.structure.payments.map((p) => ({ dueDate: p.dueDate, totalPaise: p.totalPaise })),
      netContributionPaise: x.economics.netContributionPaise,
      peakFundingPaise: x.economics.peakFundingPaise,
      peakUnpaidServiceValuePaise: x.economics.peakUnpaidServiceValuePaise,
    })),
    feasibleOrder: r?.feasible.map((x) => x.structure.id) ?? [],
    featured: { buyer: featured.buyer?.structure.id ?? null, seller: featured.seller?.structure.id ?? null },
  };
}
