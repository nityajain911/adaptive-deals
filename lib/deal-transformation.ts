import type { DealBaseline } from "@/domain/deal-baseline";
import type { EvaluatedStructure } from "@/domain/engine";
import type { ServicePackage } from "@/domain/types";
import { formatDate } from "@/domain/dates";
import { formatINR } from "@/domain/money";
import type { FollowOn } from "@/domain/follow-on";

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
  /** The rest of the year held after a first-phase offer; shown as one more line of the comparison. */
  followOn?: Pick<FollowOn, "totalPaise" | "heldUntil"> | null;
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
  if (args.offer.structure.discountBps > 0) rows.push({ id: "discount", label: "Discount", was: null, now: `${args.offer.structure.discountBps / 100}% off`, note: null });
  rows.push({ id: "payments", label: "Payments", was: `${originalPayments} payment${originalPayments === 1 ? "" : "s"}`, now: `${adaptivePayments} payment${adaptivePayments === 1 ? "" : "s"}`, note: null });
  if (args.followOn) rows.push({ id: "follow_on", label: "Rest of the year", was: null, now: `${formatINR(args.followOn.totalPaise)} held until ${formatDate(args.followOn.heldUntil)}`, note: null });
  rows.push({ id: "approval", label: "Approval", was: original.approvalLabel, now: adaptive.approvalLabel, note: null });
  return { rows, original, adaptive, changes, ...(args.economicsChanged ? { economicsChanged: args.economicsChanged } : {}) };
}

const approvalOf = (approval: "within_limit" | "requires_approval" | "unknown" | string) => approval === "within_limit" ? "Buyer can approve" : approval === "requires_approval" ? "Needs buyer approval" : "Approval needs confirming";

export type RevisionSide = { scope: { packageId: string; months: number }[]; totalPaise: number; startDate: string | null; payments: number; approval: string; heldTotalPaise?: number; heldUntil?: string; discountBps?: number; lines?: { id: string; seq: number; date: string; totalPaise: number }[] };

/** One side of a comparison, read from an agreement version's own terms. */
export function sideOfVersion(v: { terms: { scope: { packageId: string; months: number }[]; pricing: { totalPaise: number; discountBps: number }; paymentSchedule: { id: string; seq: number; dueDate: { value: string }; totalPaise: number }[]; conditions: string[]; followOn?: { pricing: { totalPaise: number }; heldUntil: string } } }, startDate: string | null = null): RevisionSide {
  const t = v.terms;
  return {
    scope: t.scope,
    totalPaise: t.pricing.totalPaise,
    startDate,
    payments: t.paymentSchedule.length,
    approval: t.conditions.includes("buyer_attests_required_approval") ? "requires_approval" : "within_limit",
    discountBps: t.pricing.discountBps,
    lines: t.paymentSchedule.map((p) => ({ id: p.id, seq: p.seq, date: p.dueDate.value, totalPaise: p.totalPaise })),
    ...(t.followOn ? { heldTotalPaise: t.followOn.pricing.totalPaise, heldUntil: t.followOn.heldUntil } : {}),
  };
}

/**
 * The same comparison for a change the buyer asked for: the side that was is the terms already committed, and the side that is
 * is what would replace them. A line that does not change is shown once.
 */
export function revisionTransformation(args: {
  was: RevisionSide;
  now: RevisionSide;
  packages: Pick<ServicePackage, "id" | "name">[];
  /** The label of the line that holds the rest of the year; only used for a first-phase offer that carries one. */
  heldLabel?: string;
}): DealTransformation {
  const name = (id: string) => args.packages.find((service) => service.id === id)?.name ?? id;
  const rows: TransformationRow[] = [];
  for (const item of args.was.scope) {
    const kept = args.now.scope.find((x) => x.packageId === item.packageId);
    rows.push({ id: item.packageId, label: name(item.packageId), was: monthLabel(item.months), now: kept ? monthLabel(kept.months) : null, note: kept ? null : "Left out" });
  }
  for (const item of args.now.scope) if (!args.was.scope.some((x) => x.packageId === item.packageId)) rows.push({ id: item.packageId, label: name(item.packageId), was: null, now: monthLabel(item.months), note: "Added" });
  if (args.was.startDate && args.now.startDate) rows.push({ id: "start", label: "Starts", was: formatDate(args.was.startDate), now: formatDate(args.now.startDate), note: null });
  if ((args.was.discountBps ?? 0) > 0 || (args.now.discountBps ?? 0) > 0) {
    const text = (bps?: number) => (bps ? `${bps / 100}% off` : null);
    rows.push({ id: "discount", label: "Discount", was: text(args.was.discountBps), now: text(args.now.discountBps), note: null });
  }
  rows.push({ id: "payments", label: "Payments", was: `${args.was.payments} payment${args.was.payments === 1 ? "" : "s"}`, now: `${args.now.payments} payment${args.now.payments === 1 ? "" : "s"}`, note: null });
  // A payment that moved to another day is its own line, with the amount that moves, so the change is seen where it happens.
  for (const before of args.was.lines ?? []) {
    const after = args.now.lines?.find((line) => line.id === before.id);
    if (after && after.date !== before.date) rows.push({ id: `pay-${before.id}`, label: `Payment ${before.seq} · ${formatINR(before.totalPaise)}`, was: formatDate(before.date), now: formatDate(after.date), note: null });
  }
  if (args.now.heldTotalPaise && args.now.heldUntil) {
    const text = (x: { heldTotalPaise?: number; heldUntil?: string }) => (x.heldTotalPaise && x.heldUntil ? `${formatINR(x.heldTotalPaise)} held until ${formatDate(x.heldUntil)}` : null);
    rows.push({ id: "follow_on", label: args.heldLabel ?? "Rest of the year", was: text(args.was), now: text(args.now), note: null });
  }
  rows.push({ id: "approval", label: "Approval", was: approvalOf(args.was.approval), now: approvalOf(args.now.approval), note: null });
  const side = (x: typeof args.was) => ({ totalPaise: x.totalPaise, scopeLabel: scopeLabel(x.scope, args.packages), durationLabel: "", approvalLabel: approvalOf(x.approval) });
  const changes: TransformationChange[] = [];
  if (scopeSignature(args.was.scope) !== scopeSignature(args.now.scope)) changes.push("scope");
  if (args.was.startDate !== args.now.startDate) changes.push("timing");
  if (args.was.payments !== args.now.payments) changes.push("payment_split");
  if (args.was.approval !== args.now.approval) changes.push("approval");
  return { rows, original: side(args.was), adaptive: side(args.now), changes };
}
