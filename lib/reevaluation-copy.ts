import { formatINR } from "@/domain/money";
import type { ReevaluationPreview } from "./reevaluation";

type Change = { field: string; from: string; to: string };

const pct = (bps: string) => (/^\d+$/.test(bps) ? `${Number(bps) / 100}%` : bps);
const rupees = (paise: string) => (/^\d+$/.test(paise) ? formatINR(Number(paise)) : paise);
const yesNo = (v: string) => (v === "true" ? "yes" : v === "false" ? "no" : v);
const months = (n: string) => (/^\d+$/.test(n) ? `${n} month${n === "1" ? "" : "s"}` : n);

const POLICY: Record<string, [string, (v: string) => string]> = {
  "policy.cashAtRiskLimitPaise": ["Most I'll spend before I'm paid", rupees],
  "policy.discountLimitBps": ["Biggest discount I'll give", pct],
  "policy.contributionFloor.minPercentBps": ["Lowest profit I'll accept", pct],
  "policy.contributionFloor.minPaise": ["Lowest profit amount", rupees],
  "policy.smallestInstalmentPaise": ["Minimum payment", rupees],
  "policy.maxTenureMonths": ["Maximum payment duration", months],
  "policy.paymentFeeBps": ["Expected payment fee", pct],
};
const PACKAGE: Record<string, [string, (v: string) => string]> = {
  directCostPaise: ["delivery cost", rupees],
  removable: ["can be removed", yesNo],
  deferrable: ["can start later", yesNo],
  hasIndependentValue: ["valuable on its own", yesNo],
};

/** One changed engine input in the merchant's words. An input it cannot name is shown as its raw field, never guessed. */
export function describeInputChange(change: Change, serviceNames: string[]): string {
  const raw = `${change.field}: ${change.from} → ${change.to}`;
  const policy = POLICY[change.field];
  if (policy) return `${policy[0]}: ${policy[1](change.from)} → ${policy[1](change.to)}`;
  const pkg = /^packages\[(\d+)\]\.(\w+)$/.exec(change.field);
  if (pkg && PACKAGE[pkg[2]] && serviceNames[Number(pkg[1])]) {
    const [label, fmt] = PACKAGE[pkg[2]];
    return `${serviceNames[Number(pkg[1])]} · ${label}: ${fmt(change.from)} → ${fmt(change.to)}`;
  }
  if (/^templates\.discountsBps\[\d+\]$/.test(change.field)) return `Approved discount level: ${pct(change.from)} → ${pct(change.to)}`;
  return raw;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What re-evaluating would do, in sentences built only from what the preview computed. */
export function describeReevaluation(p: ReevaluationPreview): { headline: string; effects: string[] } {
  if (p.blocked.length) return { headline: "This version cannot be applied to this deal.", effects: [] };
  const n = p.inputChanges.length;
  const effects: string[] = [];
  effects.push(p.becomesInfeasible.length ? `${count(p.becomesInfeasible.length, "offer", "offers")} would no longer pass your rules.` : "Every offer that is available now stays available.");
  if (p.becomesFeasible.length) effects.push(`${count(p.becomesFeasible.length, "offer", "offers")} would become available.`);
  effects.push(p.recommendationChanges ? "The recommended offer would change." : "The recommended offer stays the same.");
  if (p.staleDraftVersion !== null) effects.push(`Your unsent draft (version ${p.staleDraftVersion}) would be set aside and prepared again.`);
  return { headline: `${count(n, "input", "inputs")} would change.`, effects };
}
