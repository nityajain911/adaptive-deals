import { computeEconomics, expectedFee } from "@/domain/economics";
import { addDays, compareDates, localDateOf } from "@/domain/dates";
import { sum } from "@/domain/money";
import type { Structure } from "@/domain/structures";
import type { MerchantPolicy } from "@/domain/types";
import type { DemoState } from "./service";

export interface OutcomeSummary {
  proposedTotalPaise: number | null;
  acceptedTotalPaise: number | null;
  collected: { totalPaise: number; prePaise: number };
  provisionalContributionPaise: number;
  window: "in_progress" | "ended";
  data: "incomplete";
  label: string;
  disclosures: string[];
  inputs: { cashPrePaise: number; estimatedFeesPaise: number; costsIncurredPaise: number; cutoff: string };
}

function addCalendarDaysToIso(iso: string, days: number): string {
  if (Number.isNaN(Date.parse(iso))) throw new Error(`Invalid timestamp "${iso}"`);
  const match = /^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))$/.exec(iso);
  if (!match) throw new Error(`Timestamp must be an ISO instant with an explicit timezone: "${iso}"`);
  return `${addDays(match[1], days)}${match[2]}`;
}

export function measurementCutoff(eligibleAt: string, now: string): { cutoff: string; windowEnded: boolean } {
  if (Number.isNaN(Date.parse(now))) throw new Error(`Invalid timestamp "${now}"`);
  const windowEnd = addCalendarDaysToIso(eligibleAt, 90);
  const windowEnded = Date.parse(now) >= Date.parse(windowEnd);
  return { cutoff: windowEnded ? windowEnd : now, windowEnded };
}

function succeededAt(a: DemoState["attempts"][number]): string | null {
  if (a.status !== "succeeded") return null;
  return a.history.find((h) => h.status === "succeeded")?.at ?? null;
}

export function outcomeSummary(args: {
  s: DemoState;
  acceptedStructure: Structure | null;
  policy: MerchantPolicy;
  now: string;
  timeZone: string;
}): OutcomeSummary {
  const { s, acceptedStructure, policy, now, timeZone } = args;
  const { cutoff, windowEnded } = measurementCutoff(s.eligibleAt, now);
  const cutoffMs = Date.parse(cutoff);
  const cutoffDate = localDateOf(cutoff, timeZone);

  const paid = s.attempts.filter((a) => {
    const at = succeededAt(a);
    return at !== null && Date.parse(at) <= cutoffMs;
  });
  const collected = {
    totalPaise: sum(paid.map((a) => a.amountPaise)),
    prePaise: sum(paid.map((a) => a.prePaise)),
  };
  const estimatedFeesPaise = sum(paid.map((a) => expectedFee(a.amountPaise, policy.paymentFeeBps)));

  let costsIncurredPaise = 0;
  if (acceptedStructure) {
    const point = computeEconomics(acceptedStructure, policy).series.filter((p) => compareDates(p.date, cutoffDate) <= 0).at(-1);
    costsIncurredPaise = point?.costsIncurredPaise ?? 0;
  }

  const initialDelivery = s.deliveries
    .filter((d) => d.kind === "proposal" && d.deliveredAt !== null)
    .sort((a, b) => Date.parse(a.deliveredAt!) - Date.parse(b.deliveredAt!))[0];
  const initialAgreement = initialDelivery ? s.agreements.find((v) => v.version === initialDelivery.version) : null;
  const acceptedAgreement = [...s.agreements]
    .filter((v) => v.buyerAcceptance !== null)
    .sort((a, b) => b.version - a.version)[0];

  return {
    proposedTotalPaise: initialAgreement?.terms.pricing.totalPaise ?? null,
    acceptedTotalPaise: acceptedAgreement?.terms.pricing.totalPaise ?? null,
    collected,
    provisionalContributionPaise: collected.prePaise - estimatedFeesPaise - costsIncurredPaise,
    window: windowEnded ? "ended" : "in_progress",
    data: "incomplete",
    label: `${windowEnded ? "Window ended" : "Window in progress"} · incomplete inputs`,
    disclosures: [
      "Refund data is not modelled in this prototype. No refund amount has been assumed.",
      `Estimated payment fees at configured rate (${policy.paymentFeeBps / 100}%) — not an actual settled Razorpay fee record.`,
      "Includes modelled costs incurred up to the measurement cutoff. Irrevocably committed future costs are not modelled.",
    ],
    inputs: { cashPrePaise: collected.prePaise, estimatedFeesPaise, costsIncurredPaise, cutoff },
  };
}
