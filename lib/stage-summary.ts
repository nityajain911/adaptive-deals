import { formatINR } from "@/domain/money";
import type { ConstraintProfile } from "@/domain/types";

const list = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/**
 * One line for a settled Understand stage, written by code from facts that are stated or confirmed.
 * A basis or scope the buyer has not confirmed is left out rather than guessed.
 */
export function understandSummary(p: ConstraintProfile, packageNames: Record<string, string>): string {
  const gst = p.amountsIncludeGst.status === "stated" ? (p.amountsIncludeGst.value === "yes" ? " including GST" : p.amountsIncludeGst.value === "no" ? " excluding GST" : "") : "";
  const parts: string[] = [];
  if (p.budgetNow.value) parts.push(`Budget ${formatINR(p.budgetNow.value.amountPaise)} now${gst}`);
  if (p.approvalLimit.value) {
    const scope = p.approvalScope.status === "stated" ? (p.approvalScope.value === "per_contract" ? " per contract" : p.approvalScope.value === "per_payment" ? " per payment" : "") : "";
    parts.push(`approval limit ${formatINR(p.approvalLimit.value.amountPaise)}${gst}${scope}`);
  }
  if (p.requiredPackages.status === "stated" && p.requiredPackages.value?.length) parts.push(`Needs ${list(p.requiredPackages.value.map((id) => packageNames[id] ?? id))}`);
  return parts.join(" · ");
}
