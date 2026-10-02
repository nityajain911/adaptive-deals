import type { AgreementVersion } from "@/domain/agreement";
import type { Amendment } from "@/domain/amendment";
import type { CollectionAttempt } from "@/domain/collections";
import { formatDate } from "@/domain/dates";

/**
 * Track-stage copy derived from the real collection state (spec §6.1). Nothing here asserts a
 * state the domain has not recorded: a retry is "removed" only when the domain removed it.
 */
type S = { attempts: CollectionAttempt[]; agreements: Pick<AgreementVersion, "version" | "status" | "terms" | "supersedes">[] };

export interface ScheduleRow {
  lineId: string;
  date: string;
  was: string | null;
  amountPaise: number;
  method: string;
  status: string;
}

export function scheduleRows(s: S, version: number): ScheduleRow[] {
  const v = s.agreements.find((a) => a.version === version);
  if (!v) return [];
  const original = s.agreements.find((a) => a.version === 1);
  return v.terms.paymentSchedule.map((line) => {
    const forLine = s.attempts.filter((a) => a.scheduleLineId === line.id);
    const retry = forLine.find((a) => a.origin === "internal_retry" && a.status === "scheduled");
    const latest = [...forLine].reverse().find((a) => a.status !== "removed");
    const status = retry
      ? `Retry scheduled for ${formatDate(retry.dueDate)}`
      : !latest
        ? "Not yet scheduled"
        : latest.status === "succeeded"
          ? "Paid"
          : latest.status === "submitted"
            ? "Awaiting outcome"
            : latest.status === "failed"
              ? "Failed"
              : "Scheduled";
    const before = original?.terms.paymentSchedule.find((p) => p.id === line.id)?.dueDate.value;
    return {
      lineId: line.id,
      date: formatDate(line.dueDate.value),
      was: before && before !== line.dueDate.value ? formatDate(before) : null,
      amountPaise: line.totalPaise,
      method: line.method === "payment_link" ? "Payment link" : "Recurring debit",
      status,
    };
  });
}

export function collectionTruth(s: S, a: Pick<Amendment, "fromVersion" | "toVersion" | "state" | "change">): string[] {
  const lines: string[] = [];
  if (a.state !== "active") lines.push("No revised payment date becomes active until both you and the buyer approve.");
  const forLine = s.attempts.filter((x) => x.scheduleLineId === a.change.lineId);
  const original = forLine.find((x) => x.agreementVersion === a.fromVersion && x.origin === "agreement");
  if (original) {
    const word = original.status === "scheduled" ? "still scheduled" : original.status === "failed" ? "failed" : original.status === "removed" ? "removed after both approvals" : original.status === "succeeded" ? "paid" : "awaiting outcome";
    lines.push(`Original ${formatDate(original.dueDate)} debit: ${word}.`);
  }
  const retry = forLine.find((x) => x.origin === "internal_retry");
  if (retry?.status === "scheduled") lines.push(`Internal retry scheduled for ${formatDate(retry.dueDate)}.`);
  if (retry?.status === "removed") lines.push("Internal retry removed.");
  lines.push(`Revised date ${formatDate(a.change.toDueDate)}: ${a.state === "active" ? "scheduled" : "pending approval"}.`);
  return lines;
}
