import type { ConstraintProfile } from "@/domain/types";
import { formatDate } from "@/domain/dates";
import { formatINR } from "@/domain/money";
import type { originalProposal } from "./offer-copy";

/**
 * "What's blocking this deal" (spec §4), written by code from the constraint profile. Keeps the
 * confirmed GST basis, the quarter boundary only when it follows from the normalised period, month
 * precision without inventing a day, and the approval scope. Unconfirmed facts are marked inline.
 */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function gstWords(p: ConstraintProfile): string {
  const v = p.amountsIncludeGst.status === "stated" ? p.amountsIncludeGst.value : null;
  return v === "yes" ? "including GST" : v === "no" ? "excluding GST" : "(GST basis not confirmed)";
}

const isCalendarQuarter = (start: string, end: string) =>
  start.endsWith("-01") && [1, 4, 7, 10].includes(Number(start.slice(5, 7))) && Number(end.slice(5, 7)) === Number(start.slice(5, 7)) + 2;

export function blockingLines(p: ConstraintProfile, original: ReturnType<typeof originalProposal>): string[] {
  const lines = [`Original annual proposal: ${formatINR(original.totalPaise)} including GST`];
  const gst = gstWords(p);
  const b = p.budgetNow.value;
  if (b) {
    const label = isCalendarQuarter(b.period.start, b.period.end) ? "Current-quarter budget" : "Budget available now";
    lines.push(`${label}: ${formatINR(b.amountPaise)} ${gst}, until ${formatDate(b.period.end)}`);
  } else lines.push("Current budget: not stated");
  const nb = p.nextBudget.value;
  if (nb) {
    const when = nb.available.precision === "month" ? `${MONTHS[Number(nb.available.value.slice(5, 7)) - 1]} ${nb.available.value.slice(0, 4)} · exact day not provided` : formatDate(nb.available.value);
    lines.push(`Next budget: ${when}${nb.amountPaise !== null ? ` · ${formatINR(nb.amountPaise)}` : ""}`);
  }
  const lim = p.approvalLimit.value;
  if (lim) {
    const scope = p.approvalScope.status === "stated" ? p.approvalScope.value : null;
    lines.push(
      scope === "per_contract"
        ? `Contracts above ${formatINR(lim.amountPaise)} ${gst} require MD approval (per contract)`
        : scope === "per_payment"
          ? `Payments above ${formatINR(lim.amountPaise)} ${gst} require MD approval (per payment)`
          : `Above ${formatINR(lim.amountPaise)} ${gst} requires MD approval (per payment or per contract not confirmed)`,
    );
  }
  return lines;
}
