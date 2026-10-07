import type { EvaluatedStructure } from "@/domain/engine";
import { formatINR, sum } from "@/domain/money";
import type { ServicePackage, TemplateType } from "@/domain/types";
import type { DealBaseline } from "@/domain/deal-baseline";
import { originalProposalOf, packageName } from "./deal-context-shared";

/**
 * Code-written offer copy (spec §5.1). Headlines come from the engine's template type; every
 * figure comes from the engine or deterministic arithmetic on engine and fixture figures. AI never
 * writes or modifies any of this.
 */

const WORD = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const word = (n: number) => WORD[n] ?? String(n);
const phaseMonths = (x: EvaluatedStructure) => Math.max(...x.structure.scope.map((i) => i.months));
const paymentChoice = (x: EvaluatedStructure) => {
  if (x.structure.payments.length === 1) return "paid upfront";
  if (x.structure.payments.length === 2) return "two monthly payments";
  return `${word(x.structure.payments.length)} payments`;
};

const HEADLINES: Record<TemplateType, (x: EvaluatedStructure) => string> = {
  phased_scope: (x) => `Start with a standalone ${word(phaseMonths(x))}-month package · ${paymentChoice(x)}`,
  split_payment: () => "Keep the annual scope and split the payments",
  deferred_start: () => "Start when the buyer's next budget opens",
  shorter_commitment: () => "Offer a shorter commitment",
};

export const headlineFor = (x: EvaluatedStructure): string => HEADLINES[x.structure.template](x);

/** Accurate code fallback when validated AI wording is unavailable for this exact option. */
export function whyOffer(x: EvaluatedStructure): string {
  const payments = x.structure.payments.length === 1 ? "one payment" : `${x.structure.payments.length} payments`;
  const largestPayment = Math.max(...x.structure.payments.map((payment) => payment.totalPaise));
  if (x.structure.template === "phased_scope" && x.structure.payments.length > 1)
    return `It keeps the standalone Phase 1 scope within the buyer's confirmed limit while lowering the largest payment to ${formatINR(largestPayment)}, and it passes your rules.`;
  if (x.approval === "requires_approval") return `It fits the buyer's confirmed budget and timing through ${payments}, requires the buyer's MD approval, and passes your rules.`;
  return `It fits the buyer's confirmed budget, timing and approval limit through ${payments}, and passes your rules.`;
}

/** A forecast rounded to the nearest rupee for the decision; exact figures stay in the economics detail. */
export function approxINR(paise: number): string {
  const rupees = Math.round(Math.abs(paise) / 100);
  return `about ${formatINR(Math.sign(paise) * rupees * 100)}`;
}

export function alternativeContributionLine(x: EvaluatedStructure): string {
  const contribution = `projected contribution ${approxINR(x.economics.netContributionPaise)}`;
  return x.approval === "requires_approval" ? `If the buyer secures MD approval: ${contribution}` : contribution.replace(/^p/, "P");
}

/**
 * The deal's original annual proposal: the fixture's full scope at list price, with GST by the same
 * per-line half-up rule the engine uses. Context only; not an engine alternative, never counted as value.
 */
const fullMonths = (baseline: DealBaseline) => Math.max(...baseline.quotedScope.map((i) => i.months));
const names = (packages: Pick<ServicePackage, "id" | "name">[], ids: string[]) => ids.map((id) => packageName(packages, id));
const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** "What this offer achieves" and "What changes from the original proposal". */
export function offerSummary(x: EvaluatedStructure, baseline: DealBaseline, packages: Pick<ServicePackage, "id" | "name">[], offerGstRateBps: number): { achieves: string[]; changes: string[] } {
  const original = originalProposalOf(baseline);
  const total = sum(x.structure.payments.map((p) => p.totalPaise));
  const phased = x.structure.template === "phased_scope";
  const months = phaseMonths(x);
  const achieves = [`A proposed sale of ${formatINR(total)} including GST.`, `Projected contribution of ${approxINR(x.economics.netContributionPaise)}, based on configured costs and fees.`];
  if (phased && x.approval === "within_limit") achieves.push(`A standalone ${word(months)}-month package the buyer can approve within the confirmed limit.`);

  const changes: string[] = [];
  const left: string[] = [...names(packages, x.structure.excludedPackageIds)];
  if (phased && months < fullMonths(baseline)) left.push(`months ${months + 1}–${fullMonths(baseline)}`);
  if (left.length) changes.push(`${listJoin(left).replace(/^./, (c) => c.toUpperCase())} are not included.`);
  // Deterministic subtraction between two customer-facing totals, only on the same GST basis.
  if (offerGstRateBps === original.gstRateBps && total < original.totalPaise) changes.push(`The customer-facing proposal value is ${formatINR(original.totalPaise - total)} lower than the original annual proposal.`);
  if (phased) changes.push(`No work outside the ${word(months)}-month package is committed.`);
  if (!changes.length) changes.push("The scope and total are unchanged from the original annual proposal.");
  return { achieves, changes };
}

/** Why a merchant's counter-offer is on the table, without claiming it passes rules it does not. */
export function counterReason(failingTexts: string[]): string {
  if (!failingTexts.length) return "You set this total in answer to the buyer's request, and the engine found that every rule passes.";
  return `You set this total in answer to the buyer's request. It does not meet: ${failingTexts.join("; ")} You chose to override that.`;
}
