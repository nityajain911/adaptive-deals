import type { DealEvaluation } from "@/domain/engine";
import type { ConstraintProfile } from "@/domain/types";
import { formatDate } from "@/domain/dates";
import { formatINR } from "@/domain/money";
import type { originalProposalOf } from "./deal-context-shared";

/**
 * "What's blocking this deal" (spec §4), written by code from the constraint profile. Keeps the
 * confirmed GST basis, the quarter boundary only when it follows from the normalised period, month
 * precision without inventing a day, and the approval scope. Unconfirmed facts are marked inline.
 */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function gstWords(p: ConstraintProfile): string {
  const v = p.amountsIncludeGst.status === "stated" ? p.amountsIncludeGst.value : null;
  return v === "yes" ? "including GST" : v === "no" ? "excluding GST" : "(not clear if this includes GST)";
}

const isCalendarQuarter = (start: string, end: string) =>
  start.endsWith("-01") && [1, 4, 7, 10].includes(Number(start.slice(5, 7))) && Number(end.slice(5, 7)) === Number(start.slice(5, 7)) + 2;

export function blockingLines(p: ConstraintProfile, original: ReturnType<typeof originalProposalOf>): string[] {
  const lines = [`Your quote: ${formatINR(original.totalPaise)} including GST`];
  const gst = gstWords(p);
  const b = p.budgetNow.value;
  if (b) {
    const label = isCalendarQuarter(b.period.start, b.period.end) ? "Their budget this quarter" : "Their budget now";
    lines.push(`${label}: ${formatINR(b.amountPaise)} ${gst}, until ${formatDate(b.period.end)}`);
  } else lines.push("Their budget: not mentioned");
  const nb = p.nextBudget.value;
  if (nb) {
    const when = nb.available.precision === "month" ? `${MONTHS[Number(nb.available.value.slice(5, 7)) - 1]} ${nb.available.value.slice(0, 4)}` : formatDate(nb.available.value);
    lines.push(`More budget from: ${when}${nb.amountPaise !== null ? ` · ${formatINR(nb.amountPaise)}` : ""}`);
  }
  const lim = p.approvalLimit.value;
  if (lim) {
    const scope = p.approvalScope.status === "stated" ? p.approvalScope.value : null;
    lines.push(
      scope === "per_contract"
        ? `Their MD must approve anything above ${formatINR(lim.amountPaise)} ${gst}, counted for the whole deal`
        : scope === "per_payment"
          ? `Their MD must approve any single payment above ${formatINR(lim.amountPaise)} ${gst}`
          : `Their MD must approve anything above ${formatINR(lim.amountPaise)} ${gst}; not clear if that is per payment or for the whole deal`,
    );
  }
  return lines;
}

const UNCAPTURED_LABEL: Record<string, string> = {
  amountsIncludeGst: "Whether GST is included",
  approvalScope: "Whether the approval limit is per payment or for the whole deal",
  nextBudget: "The exact day their next budget opens",
};

/**
 * Facts the conversation did not state where the engine found no difference: every structure has the
 * same verdict and approval status under either reading. They are disclosed rather than asked about.
 * Derived from the engine's own ambiguity analysis, never from model output.
 */
export function uncapturedLines(evaluation: Pick<DealEvaluation, "state" | "ambiguities">): string[] {
  if (evaluation.state !== "options_ready") return [];
  return evaluation.ambiguities
    .filter((a) => !a.decisionRelevant)
    .map((a) => `${UNCAPTURED_LABEL[a.field] ?? a.field} was not mentioned. Every offer works either way, so we did not need to ask.`);
}
