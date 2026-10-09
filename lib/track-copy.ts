import type { AgreementVersion } from "@/domain/agreement";
import type { Amendment } from "@/domain/amendment";
import type { CollectionAttempt } from "@/domain/collections";
import { formatDate } from "@/domain/dates";
import type { Mandate } from "@/domain/mandate";
import type { PaymentLinkState } from "@/integrations/razorpay";

/**
 * Track-stage copy derived from the real collection state (spec §6.1). Nothing here asserts a
 * state the domain has not recorded: a retry is "removed" only when the domain removed it.
 */
type S = {
  attempts: CollectionAttempt[];
  agreements: Pick<AgreementVersion, "version" | "status" | "terms" | "supersedes">[];
  paymentLinks?: PaymentLinkState[];
  mandate?: Mandate | null;
};

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
    const before = original?.terms.paymentSchedule.find((p) => p.id === line.id)?.dueDate.value;
    const accepted = ["accepted", "active", "superseded"].includes(v.status);
    const link = line.method === "payment_link" ? s.paymentLinks?.at(-1) : null;
    let status: string;
    if (latest?.status === "succeeded" || link?.status === "paid") status = "Paid";
    else if (latest?.status === "submitted") status = "Processing";
    else if (retry) status = `Retry scheduled for ${formatDate(retry.dueDate)}`;
    else if (latest?.status === "failed") status = "Failed";
    else if (before && before !== line.dueDate.value && latest?.origin === "amendment") status = `Moved to ${formatDate(line.dueDate.value)}`;
    else if (!accepted) status = "Not scheduled";
    else if (line.method === "payment_link" && link) status = "Payment link sent";
    else if (line.method === "recurring_debit" && s.mandate?.status === "confirmed") status = "Scheduled";
    else status = "Awaiting buyer setup";
    return {
      lineId: line.id,
      date: formatDate(line.dueDate.value),
      was: before && before !== line.dueDate.value ? formatDate(before) : null,
      amountPaise: line.totalPaise,
      method: line.method === "payment_link" ? "Pay online (link)" : "Automatic payment",
      status,
    };
  });
}

export function collectionTruth(s: S, a: Pick<Amendment, "fromVersion" | "toVersion" | "state" | "change">): string[] {
  const lines: string[] = [];
  if (a.state !== "active") lines.push("Nothing changes until you and the buyer both agree.");
  const forLine = s.attempts.filter((x) => x.scheduleLineId === a.change.lineId);
  const original = forLine.find((x) => x.agreementVersion === a.fromVersion && x.origin === "agreement");
  if (original) {
    const word = original.status === "scheduled" ? "still planned" : original.status === "failed" ? "failed" : original.status === "removed" ? "replaced" : original.status === "succeeded" ? "paid" : "waiting for the result";
    lines.push(`The ${formatDate(original.dueDate)} payment: ${word}.`);
  }
  const retry = forLine.find((x) => x.origin === "internal_retry");
  if (retry?.status === "scheduled") lines.push(`We will try again on ${formatDate(retry.dueDate)}.`);
  if (retry?.status === "removed") lines.push("The retry was cancelled.");
  lines.push(`New date ${formatDate(a.change.toDueDate)}: ${a.state === "active" ? "planned" : "waiting for agreement"}.`);
  return lines;
}
