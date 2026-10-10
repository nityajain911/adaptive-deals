import type { AgreementVersion } from "@/domain/agreement";
import type { CollectionAttempt } from "@/domain/collections";
import { formatDate } from "@/domain/dates";
import { formatINR } from "@/domain/money";
import type { AdvanceNotice } from "@/domain/notices";
import type { DeliveryRecord } from "@/lib/deal-records";

export type TimelineItemState = "completed" | "current" | "future" | "replaced" | "failed" | "waiting";

export interface TimelineItem {
  id: string;
  at: string;
  label: string;
  detail?: string;
  state: TimelineItemState;
  sourceIds: string[];
}

type TimelineState = {
  agreements: AgreementVersion[];
  attempts: CollectionAttempt[];
  notices: AdvanceNotice[];
  deliveries?: DeliveryRecord[];
  events: { id: string; at: string; kind: string; title: string; detail: string | null }[];
};

const at10 = (date: string) => `${date}T10:00:00+05:30`;
const historyAt = (attempt: CollectionAttempt, status: CollectionAttempt["status"]) => attempt.history.find((entry) => entry.status === status)?.at ?? at10(attempt.dueDate);

function lineage(agreements: AgreementVersion[], version: number) {
  const selected = agreements.find((agreement) => agreement.version === version);
  if (!selected) return new Set<number>();
  const versions = new Set<number>([selected.version]);
  let parent = selected.supersedes ?? null;
  while (parent !== null) {
    versions.add(parent);
    parent = agreements.find((agreement) => agreement.version === parent)?.supersedes ?? null;
  }
  return versions;
}

/**
 * One chronological account of a contractual version. It reads the agreement, notices and collection
 * records directly; it never synthesises a "paid" or "scheduled" status from a future promise.
 */
export function paymentTimeline(s: TimelineState, version: number): TimelineItem[] {
  const versions = lineage(s.agreements, version);
  if (!versions.size) return [];
  const items: TimelineItem[] = [];
  const agreements = s.agreements.filter((agreement) => versions.has(agreement.version));

  for (const delivery of (s.deliveries ?? []).filter((delivery) => versions.has(delivery.version) && delivery.deliveredAt)) {
    items.push({
      id: `delivered-v${delivery.version}`,
      at: delivery.deliveredAt!,
      label: delivery.kind === "amendment" ? "Revised proposal sent to buyer" : "Proposal sent to buyer",
      detail: `Version ${delivery.version}.`,
      state: "completed",
      sourceIds: [`delivery-v${delivery.version}`, ...(delivery.reference ? [delivery.reference] : [])],
    });
  }

  for (const agreement of agreements) {
    if (agreement.buyerAcceptance) {
      items.push({
        id: `accepted-v${agreement.version}`,
        at: agreement.buyerAcceptance.at,
        label: agreement.supersedes ? "Buyer accepted revised payment date" : "Buyer accepted the deal",
        detail: `Version ${agreement.version} confirmed.`,
        state: "completed",
        sourceIds: [`agreement-v${agreement.version}`],
      });
    }
  }

  const attempts = s.attempts.filter((attempt) => versions.has(attempt.agreementVersion));
  const attemptIds = new Set(attempts.map((attempt) => attempt.id));
  for (const notice of s.notices.filter((notice) => attemptIds.has(notice.attemptId) && notice.sentAt)) {
    items.push({ id: `notice-${notice.id}`, at: notice.sentAt!, label: "Payment reminder sent", detail: `${formatINR(notice.amountPaise)} is due on ${formatDate(notice.dueDate)}.`, state: "completed", sourceIds: [notice.id, notice.attemptId] });
  }

  const scheduled: TimelineItem[] = [];
  for (const attempt of attempts) {
    const amount = formatINR(attempt.amountPaise);
    if (attempt.status === "succeeded") {
      items.push({ id: `paid-${attempt.id}`, at: historyAt(attempt, "succeeded"), label: `Payment received · ${amount}`, detail: `Due ${formatDate(attempt.dueDate)}.`, state: "completed", sourceIds: [attempt.id] });
    } else if (attempt.status === "failed") {
      items.push({ id: `failed-${attempt.id}`, at: historyAt(attempt, "failed"), label: `Payment attempt failed · ${amount}`, detail: `Due ${formatDate(attempt.dueDate)}.`, state: "failed", sourceIds: [attempt.id] });
    } else if (attempt.status === "removed") {
      items.push({ id: `replaced-${attempt.id}`, at: at10(attempt.dueDate), label: `Payment on ${formatDate(attempt.dueDate)} replaced`, detail: `${amount} will not be collected on this date.`, state: "replaced", sourceIds: [attempt.id] });
    } else if (attempt.status === "submitted") {
      items.push({ id: `processing-${attempt.id}`, at: historyAt(attempt, "submitted"), label: `Payment processing · ${amount}`, detail: `Due ${formatDate(attempt.dueDate)}.`, state: "current", sourceIds: [attempt.id] });
    } else {
      scheduled.push({ id: `scheduled-${attempt.id}`, at: at10(attempt.dueDate), label: `${attempt.method === "payment_link" ? "Payment link" : "Automatic payment"} · ${amount}`, detail: `Due ${formatDate(attempt.dueDate)}.`, state: "future", sourceIds: [attempt.id] });
    }
  }
  scheduled.sort((a, b) => a.at.localeCompare(b.at));
  if (scheduled.length) scheduled[0] = { ...scheduled[0], state: "current" };
  items.push(...scheduled);

  for (const event of s.events.filter((event) => ["mandate_requested", "mandate_confirmed"].includes(event.kind))) {
    items.push({ id: `event-${event.id}`, at: event.at, label: event.kind === "mandate_confirmed" ? "Automatic payment authorised" : "Automatic payment setup requested", detail: event.detail ?? undefined, state: event.kind === "mandate_confirmed" ? "completed" : "waiting", sourceIds: [event.id] });
  }

  return items.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
