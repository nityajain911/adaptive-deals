import type { EvaluatedStructure } from "@/domain/engine";
import { formatINR, lineWithGst, sum } from "@/domain/money";
import type { TemplateType } from "@/domain/types";
import { heroMerchant, heroPackages, heroTemplates } from "@/data/synthetic/hero";

/**
 * Code-written offer copy (spec §5.1). Headlines come from the engine's template type; every
 * figure comes from the engine or deterministic arithmetic on engine and fixture figures. AI never
 * writes or modifies any of this.
 */

const WORD = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const word = (n: number) => WORD[n] ?? String(n);
const phaseMonths = (x: EvaluatedStructure) => Math.max(...x.structure.scope.map((i) => i.months));

const HEADLINES: Record<TemplateType, (x: EvaluatedStructure) => string> = {
  phased_scope: (x) => `Start with a standalone ${word(phaseMonths(x))}-month package`,
  split_payment: () => "Keep the annual scope and split the payments",
  deferred_start: () => "Start when the buyer's next budget opens",
  shorter_commitment: () => "Offer a shorter commitment",
};

export const headlineFor = (x: EvaluatedStructure): string => HEADLINES[x.structure.template](x);

/**
 * The deal's original annual proposal: the fixture's full scope at list price, with GST by the same
 * per-line half-up rule the engine uses. Context only; not an engine alternative, never counted as value.
 */
export function originalProposal(): { prePaise: number; gstPaise: number; totalPaise: number; gstRateBps: number } {
  const gstRateBps = heroMerchant.policy.gstRateBps;
  const prePaise = sum(heroTemplates.fullScope.map((i) => heroPackages.find((p) => p.id === i.packageId)!.listPricePaise * (heroPackages.find((p) => p.id === i.packageId)!.kind === "monthly" ? i.months : 1)));
  const line = lineWithGst(prePaise, gstRateBps);
  return { prePaise, gstPaise: line.gstPaise, totalPaise: line.totalPaise, gstRateBps };
}

const fullMonths = () => Math.max(...heroTemplates.fullScope.map((i) => i.months));
const names = (ids: string[]) => ids.map((id) => heroPackages.find((p) => p.id === id)?.name ?? id);
const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** "What this offer achieves" and "What changes from the original proposal". */
export function offerSummary(x: EvaluatedStructure, original: ReturnType<typeof originalProposal>, offerGstRateBps: number): { achieves: string[]; changes: string[] } {
  const total = sum(x.structure.payments.map((p) => p.totalPaise));
  const phased = x.structure.template === "phased_scope";
  const months = phaseMonths(x);
  const achieves = [`A proposed sale of ${formatINR(total)} including GST.`, `Projected contribution of ${formatINR(x.economics.netContributionPaise)}, based on configured costs and fees.`];
  if (phased && x.approval === "within_limit") achieves.push(`A standalone ${word(months)}-month package the buyer can approve within the confirmed limit.`);

  const changes: string[] = [];
  const left: string[] = [...names(x.structure.excludedPackageIds)];
  if (phased && months < fullMonths()) left.push(`months ${months + 1}–${fullMonths()}`);
  if (left.length) changes.push(`${listJoin(left).replace(/^./, (c) => c.toUpperCase())} are not included.`);
  // Deterministic subtraction between two customer-facing totals, only on the same GST basis.
  if (offerGstRateBps === original.gstRateBps && total < original.totalPaise) changes.push(`The customer-facing proposal value is ${formatINR(original.totalPaise - total)} lower than the original annual proposal.`);
  if (phased) changes.push(`No work outside the ${word(months)}-month package is committed.`);
  if (!changes.length) changes.push("The scope and total are unchanged from the original annual proposal.");
  return { achieves, changes };
}
