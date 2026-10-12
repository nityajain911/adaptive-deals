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

export interface ConstraintRow {
  id: "quote" | "budget" | "nextBudget" | "approval" | "needs" | "start" | "condition";
  label: string;
  value: string;
  /** A second, quieter line. */
  note: string | null;
  /** The buyer's own words the value was read from; none for the merchant's own quote. */
  evidence: { quote: string; messageId: string; start: number; end: number }[];
}

const evidenceOf = (field: { evidence: { quote: string; messageId: string; start: number; end: number }[] }) => field.evidence.map((e) => ({ quote: e.quote, messageId: e.messageId, start: e.start, end: e.end }));
const monthName = (date: { value: string; precision: "day" | "month" }) => (date.precision === "month" ? `${MONTHS[Number(date.value.slice(5, 7)) - 1]} ${date.value.slice(0, 4)}` : formatDate(date.value));

/**
 * The same facts as `blockingLines`, one per row, so each can carry its own source and flag. Worked out by code from the
 * verified profile. GST is spelled out only once the buyer has confirmed it; until then the row says nothing about it and
 * the page flags it.
 */
export function constraintRows(p: ConstraintProfile, original: ReturnType<typeof originalProposalOf>, packageNames: Record<string, string>): ConstraintRow[] {
  const rows: ConstraintRow[] = [{ id: "quote", label: "Your quote", value: `${formatINR(original.totalPaise)} including GST`, note: null, evidence: [] }];
  const gst = p.amountsIncludeGst.status === "stated" ? p.amountsIncludeGst.value : null;
  const gstText = gst === "yes" ? " including GST" : gst === "no" ? " excluding GST" : "";
  const b = p.budgetNow.value;
  if (b) rows.push({ id: "budget", label: isCalendarQuarter(b.period.start, b.period.end) ? "Budget this quarter" : "Budget now", value: `${formatINR(b.amountPaise)}${gstText}, until ${formatDate(b.period.end)}`, note: null, evidence: evidenceOf(p.budgetNow) });
  else rows.push({ id: "budget", label: "Budget", value: "Not mentioned", note: null, evidence: [] });
  const nb = p.nextBudget.value;
  if (nb) rows.push({ id: "nextBudget", label: "More budget", value: `From ${monthName(nb.available)}${nb.amountPaise !== null ? ` · ${formatINR(nb.amountPaise)}` : ""}`, note: null, evidence: evidenceOf(p.nextBudget) });
  const lim = p.approvalLimit.value;
  if (lim) {
    const scope = p.approvalScope.status === "stated" ? p.approvalScope.value : null;
    rows.push({
      id: "approval",
      label: "Approval",
      value: scope === "per_payment" ? `Any payment above ${formatINR(lim.amountPaise)} needs their MD` : `Above ${formatINR(lim.amountPaise)} needs their MD${scope === "per_contract" ? ", counted for the whole deal" : ""}`,
      note: null,
      evidence: evidenceOf(p.approvalLimit),
    });
  }
  const required = p.requiredPackages.value ?? [];
  if (required.length) {
    const optional = (p.optionalPackages.value ?? []).map((id) => packageNames[id] ?? id);
    rows.push({ id: "needs", label: "Needs", value: required.map((id) => packageNames[id] ?? id).join(", "), note: optional.length ? `${optional.join(", ")} can wait` : null, evidence: evidenceOf(p.requiredPackages) });
  }
  const start = p.latestStart.value;
  if (start) rows.push({ id: "start", label: "Start by", value: monthName(start), note: null, evidence: evidenceOf(p.latestStart) });
  // The buyer's own condition, in their words, so it is not left only in the chat. One row; any further condition stays in the chat.
  const condition = p.otherConstraints.find((field) => field.status === "stated" && field.rawText);
  if (condition) rows.push({ id: "condition", label: "Condition", value: condition.rawText!, note: null, evidence: evidenceOf(condition) });
  return rows;
}
