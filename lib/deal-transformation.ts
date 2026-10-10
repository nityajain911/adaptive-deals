import type { DealBaseline } from "@/domain/deal-baseline";
import type { EvaluatedStructure } from "@/domain/engine";
import type { ServicePackage } from "@/domain/types";

export type TransformationChange = "scope" | "timing" | "payment_split" | "approval";

export type DealTransformation = {
  original: { totalPaise: number; scopeLabel: string; durationLabel: string; approvalLabel: string };
  adaptive: { totalPaise: number; scopeLabel: string; durationLabel: string; approvalLabel: string };
  changes: TransformationChange[];
  economicsChanged?: { fromVersion: number; toVersion: number; contributionDeltaPaise: number };
};

const monthLabel = (months: number) => `${months} month${months === 1 ? "" : "s"}`;
const approvalLabel = (approval: EvaluatedStructure["approval"]) => approval === "within_limit" ? "Buyer can approve" : approval === "requires_approval" ? "Needs buyer approval" : "Approval needs confirming";
const scopeSignature = (scope: { packageId: string; months: number }[]) => [...scope].sort((a, b) => a.packageId.localeCompare(b.packageId)).map((item) => `${item.packageId}:${item.months}`).join("|");
const scopeLabel = (scope: { packageId: string; months: number }[], packages: Pick<ServicePackage, "id" | "name">[]) => scope.map((item) => `${packages.find((service) => service.id === item.packageId)?.name ?? item.packageId}${item.months > 1 ? ` · ${monthLabel(item.months)}` : ""}`).join(", ");
const duration = (scope: { months: number }[]) => Math.max(...scope.map((item) => item.months));

/**
 * A presentation model drawn only from immutable baseline data and one evaluated structure.
 * It never enumerates or ranks offers; those actions remain in the engine.
 */
export function dealTransformation(args: {
  baseline: DealBaseline;
  offer: EvaluatedStructure;
  packages: Pick<ServicePackage, "id" | "name">[];
  originalApprovalLabel: string;
  originalStartDate?: string;
  originalPaymentCount?: number;
  economicsChanged?: DealTransformation["economicsChanged"];
}): DealTransformation {
  const originalMonths = duration(args.baseline.quotedScope);
  const adaptiveMonths = duration(args.offer.structure.scope);
  const originalPayments = args.originalPaymentCount ?? 1;
  const adaptivePayments = args.offer.structure.payments.length;
  const original = {
    totalPaise: args.baseline.quotedTotalPaise,
    scopeLabel: scopeLabel(args.baseline.quotedScope, args.packages),
    durationLabel: `${monthLabel(originalMonths)} · ${originalPayments} payment${originalPayments === 1 ? "" : "s"}`,
    approvalLabel: args.originalApprovalLabel,
  };
  const adaptive = {
    totalPaise: args.offer.structure.payments.reduce((sum, payment) => sum + payment.totalPaise, 0),
    scopeLabel: scopeLabel(args.offer.structure.scope, args.packages),
    durationLabel: `${monthLabel(adaptiveMonths)} · ${adaptivePayments} payment${adaptivePayments === 1 ? "" : "s"}`,
    approvalLabel: approvalLabel(args.offer.approval),
  };
  const changes: TransformationChange[] = [];
  if (scopeSignature(args.baseline.quotedScope) !== scopeSignature(args.offer.structure.scope)) changes.push("scope");
  if (args.originalStartDate && args.originalStartDate !== args.offer.structure.startDate) changes.push("timing");
  if (originalPayments !== adaptivePayments) changes.push("payment_split");
  if (original.approvalLabel !== adaptive.approvalLabel) changes.push("approval");
  return { original, adaptive, changes, ...(args.economicsChanged ? { economicsChanged: args.economicsChanged } : {}) };
}
