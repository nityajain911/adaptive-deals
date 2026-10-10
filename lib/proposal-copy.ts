import { formatINR } from "@/domain/money";
import type { ProposalView } from "@/lib/views";

const list = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** One line a buyer can read first: what they buy, what is due now, and the next commitment. */
export function proposalGlance(v: Pick<ProposalView, "included" | "payments">): string {
  const [first, second] = v.payments;
  if (!first) return list(v.included.map((i) => i.name));
  const later = second ? `, then ${formatINR(second.totalPaise)} on ${second.date}` : "";
  return `${list(v.included.map((i) => i.name))} · ${formatINR(first.totalPaise)} now${later}.`;
}

/** The attestation the buyer makes, worded from the terms they accept. The disclosure stays a separate note. */
export function authorityStatement(reason: ProposalView["authorityReason"], totalPaise: number): { label: string | null; note: string | null } {
  if (reason === "required_approval") return { label: `I confirm my company has approved this ${formatINR(totalPaise)} deal.`, note: "We can't check who approved it." };
  if (reason === "phase_scope") return { label: `I confirm I can approve this ${formatINR(totalPaise)} package on its own.`, note: "It has value on its own and is not part of a larger purchase split to avoid approval." };
  return { label: null, note: null };
}

/** Collection happens on the scheduled dates; moving one needs a revised proposal that both sides accept. */
export function recurringStatement(r: NonNullable<ProposalView["recurring"]>, merchantName: string): string {
  return `You allow ${merchantName} to take the payments above automatically, up to ${formatINR(r.perDebitLimitPaise)} each, until ${r.endDate}. We remind you ${r.noticeDays} days before each one. A payment date changes only if you both agree to a new version.`;
}

/**
 * Starting points for a change request. The chosen topic travels with the request, so the merchant is
 * offered a different-total answer only for a request about the price, never for a date or a scope.
 */
export const CHANGE_STARTERS = [
  { id: "date", label: "A different payment date", text: "I'd like a different payment date: " },
  { id: "scope", label: "Change what's included", text: "I'd like to change what's included: " },
  { id: "price", label: "A lower price", text: "Could you do a lower total? " },
  { id: "other", label: "Something else", text: "" },
] as const;
