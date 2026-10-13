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
  // An advance and a balance: say what is paid when, not how many payments.
  if (x.structure.params.plan === "advance_40") return "40% on signing, the rest a month later";
  if (x.structure.payments.length === 2) return "two monthly payments";
  return `${word(x.structure.payments.length)} payments`;
};

const HEADLINES: Record<TemplateType, (x: EvaluatedStructure) => string> = {
  phased_scope: (x) => `Start with a ${word(phaseMonths(x))}-month package · ${paymentChoice(x)}`,
  split_payment: () => "Keep the full project and split the payments",
  deferred_start: () => "Start when their next budget opens",
  // Fewer months of the same services: say how many, and how it is paid.
  shorter_commitment: (x) => `Offer a ${word(phaseMonths(x))}-month commitment · ${paymentChoice(x)}`,
};

export const headlineFor = (x: EvaluatedStructure): string => {
  const base = HEADLINES[x.structure.template](x);
  const without = x.structure.params.counter_scope_removed_name;
  return typeof without === "string" ? `${base} · without ${without}` : base;
};

/** Accurate code fallback when validated AI wording is unavailable for this exact option. */
export function whyOffer(x: EvaluatedStructure): string {
  if (x.structure.discountBps > 0) {
    const first = x.structure.payments[0];
    const total = sum(x.structure.payments.map((payment) => payment.totalPaise));
    return `It gives ${x.structure.discountBps / 100}% off only against part of the payment on signing (${formatINR(first.totalPaise)} of ${formatINR(total)}), and still keeps your profit limit.`;
  }
  const payments = x.structure.payments.length === 1 ? "one payment" : `${x.structure.payments.length} payments`;
  const largestPayment = Math.max(...x.structure.payments.map((payment) => payment.totalPaise));
  if (x.structure.template === "phased_scope" && x.structure.payments.length > 1)
    return `It covers what they need most, fits their budget, and keeps each payment to ${formatINR(largestPayment)}.`;
  if (x.approval === "requires_approval") return `It covers everything they need in ${payments}, but their MD has to approve it.`;
  return `It fits their budget and approval limit, in ${payments}.`;
}

/** A forecast rounded to the nearest rupee for the decision; exact figures stay in the economics detail. */
export function approxINR(paise: number): string {
  const rupees = Math.round(Math.abs(paise) / 100);
  return `about ${formatINR(Math.sign(paise) * rupees * 100)}`;
}

export function alternativeContributionLine(x: EvaluatedStructure): string {
  const keep = `you'd keep ${approxINR(x.economics.netContributionPaise)}`;
  return x.approval === "requires_approval" ? `If their MD approves, ${keep}` : keep.replace(/^y/, "Y");
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
  const achieves = [`A sale of ${formatINR(total)} including GST.`, `You'd keep ${approxINR(x.economics.netContributionPaise)} after your costs and fees.`];
  if (phased && x.approval === "within_limit") achieves.push(`A ${word(months)}-month package the buyer can approve on their own.`);

  const changes: string[] = [];
  const left: string[] = [...names(packages, x.structure.excludedPackageIds)];
  if (phased && months < fullMonths(baseline)) left.push(`months ${months + 1}–${fullMonths(baseline)}`);
  if (left.length) changes.push(`${listJoin(left).replace(/^./, (c) => c.toUpperCase())} ${left.length === 1 ? "is" : "are"} left out.`);
  // Deterministic subtraction between two customer-facing totals, only on the same GST basis.
  if (offerGstRateBps === original.gstRateBps && total < original.totalPaise) changes.push(`${formatINR(original.totalPaise - total)} less than your original quote.`);
  if (phased) changes.push(`Nothing beyond the ${word(months)} months is promised.`);
  if (!changes.length) changes.push("Same work and same price as your original quote.");
  return { achieves, changes };
}

/** Why a merchant's counter-offer is on the table, without claiming it passes rules it does not. */
export function counterReason(failingTexts: string[]): string {
  if (!failingTexts.length) return "You set this total in answer to the buyer. It is within all your limits.";
  return `You set this total in answer to the buyer. It is outside your limits: ${joinRules(failingTexts)} You chose to go ahead anyway.`;
}

/** Several rule explanations as one sentence: each already ends in a full stop, so those are dropped before joining. */
export function joinRules(texts: string[]): string {
  return `${texts.map((t) => t.replace(/\.\s*$/, "")).join("; ")}.`;
}
