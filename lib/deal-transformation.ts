import type { DealBaseline } from "@/domain/deal-baseline";
import type { EvaluatedStructure } from "@/domain/engine";
import type { ServicePackage } from "@/domain/types";
import { formatDate } from "@/domain/dates";

export type TransformationChange = "scope" | "timing" | "payment_split" | "approval";

/** One line of the quote-to-offer comparison: what the original quote said and what the offer says. */
export type TransformationRow = { id: string; label: string; was: string | null; now: string | null; note: string | null };

export type DealTransformation = {
  rows?: TransformationRow[];
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
  /** Services the buyer said can wait; a service dropped from the offer that is among them says so. */
  canWaitIds?: string[];
}): DealTransformation {
  const originalMonths = duration(args.baseline.quotedScope);
  const adaptiveMonths = duration(args.offer.structure.scope);
  const originalPayments = args.originalPaymentCount ?? 1;
  const adaptivePayments = args.offer.structure.payments.length;
  const original = {
    totalPaise: args.baseline.quotedTotalPaise,
    scopeLabel: scopeLabel(args.baseline.quotedScope, args.packages),
    durationLabel: `${args.originalStartDate ? `Starts ${formatDate(args.originalStartDate)} · ` : ""}${monthLabel(originalMonths)} · ${originalPayments} payment${originalPayments === 1 ? "" : "s"}`,
    approvalLabel: args.originalApprovalLabel,
  };
  const adaptive = {
    totalPaise: args.offer.structure.payments.reduce((sum, payment) => sum + payment.totalPaise, 0),
    scopeLabel: scopeLabel(args.offer.structure.scope, args.packages),
    durationLabel: `Starts ${formatDate(args.offer.structure.startDate)} · ${monthLabel(adaptiveMonths)} · ${adaptivePayments} payment${adaptivePayments === 1 ? "" : "s"}`,
    approvalLabel: approvalLabel(args.offer.approval),
  };
  const changes: TransformationChange[] = [];
  if (scopeSignature(args.baseline.quotedScope) !== scopeSignature(args.offer.structure.scope)) changes.push("scope");
  if (args.originalStartDate && args.originalStartDate !== args.offer.structure.startDate) changes.push("timing");
  if (originalPayments !== adaptivePayments) changes.push("payment_split");
  if (original.approvalLabel !== adaptive.approvalLabel) changes.push("approval");
  const name = (id: string) => args.packages.find((service) => service.id === id)?.name ?? id;
  const rows: TransformationRow[] = [];
  for (const item of args.baseline.quotedScope) {
    const kept = args.offer.structure.scope.find((x) => x.packageId === item.packageId);
    rows.push({ id: item.packageId, label: name(item.packageId), was: monthLabel(item.months), now: kept ? monthLabel(kept.months) : null, note: kept ? null : args.canWaitIds?.includes(item.packageId) ? "They said it can wait" : "Not included" });
  }
  for (const item of args.offer.structure.scope) {
    if (!args.baseline.quotedScope.some((x) => x.packageId === item.packageId)) rows.push({ id: item.packageId, label: name(item.packageId), was: null, now: monthLabel(item.months), note: "Added" });
  }
  if (args.originalStartDate && args.originalStartDate !== args.offer.structure.startDate) rows.push({ id: "start", label: "Starts", was: formatDate(args.originalStartDate), now: formatDate(args.offer.structure.startDate), note: null });
  rows.push({ id: "payments", label: "Payments", was: `${originalPayments} payment${originalPayments === 1 ? "" : "s"}`, now: `${adaptivePayments} payment${adaptivePayments === 1 ? "" : "s"}`, note: null });
  rows.push({ id: "approval", label: "Approval", was: original.approvalLabel, now: adaptive.approvalLabel, note: null });
  return { rows, original, adaptive, changes, ...(args.economicsChanged ? { economicsChanged: args.economicsChanged } : {}) };
}
