import { computeEconomics, expectedFee } from "@/domain/economics";
import { compareDates, localDateOf } from "@/domain/dates";
import { sum } from "@/domain/money";
import type { Structure } from "@/domain/structures";
import type { MerchantPolicy } from "@/domain/types";
import type { DemoState } from "./service";
import { measurementCutoff } from "./financial-view";
export { measurementCutoff } from "./financial-view";

export interface OutcomeSummary {
  proposedTotalPaise: number | null;
  acceptedTotalPaise: number | null;
  collected: { totalPaise: number; prePaise: number };
  provisionalContributionPaise: number;
  fullContractForecastContributionPaise: number | null;
  window: "in_progress" | "ended";
  data: "incomplete";
  label: string;
  disclosures: string[];
  inputs: { cashPrePaise: number; estimatedFeesPaise: number; costsIncurredPaise: number; cutoff: string };
}

function succeededAt(a: DemoState["attempts"][number]): string | null {
  if (a.status !== "succeeded") return null;
  return a.history.find((h) => h.status === "succeeded")?.at ?? null;
}

/** What the buyer has accepted in all: the latest accepted version, plus the first phase when it is the rest of the year. */
function acceptedTotalOf(s: DemoState, v: DemoState["agreements"][number]): number {
  const before = v.continuesFrom ? s.agreements.find((x) => x.version === v.continuesFrom) : undefined;
  return v.terms.pricing.totalPaise + (before ? acceptedTotalOf(s, before) : 0);
}

export function outcomeSummary(args: {
  s: DemoState;
  acceptedStructure: Structure | null;
  /** The earlier phases this one carries on from, whose costs and forecast belong to the same deal. */
  earlierStructures?: Structure[];
  policy: MerchantPolicy;
  now: string;
  timeZone: string;
}): OutcomeSummary {
  const { s, acceptedStructure, policy, now, timeZone } = args;
  const phases = acceptedStructure ? [acceptedStructure, ...(args.earlierStructures ?? [])] : [];
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
  for (const phase of phases) {
    const point = computeEconomics(phase, policy).series.filter((p) => compareDates(p.date, cutoffDate) <= 0).at(-1);
    costsIncurredPaise += point?.costsIncurredPaise ?? 0;
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
    acceptedTotalPaise: acceptedAgreement ? acceptedTotalOf(s, acceptedAgreement) : null,
    collected,
    provisionalContributionPaise: collected.prePaise - estimatedFeesPaise - costsIncurredPaise,
    fullContractForecastContributionPaise: phases.length ? sum(phases.map((phase) => computeEconomics(phase, policy).netContributionPaise)) : null,
    window: windowEnded ? "ended" : "in_progress",
    data: "incomplete",
    label: `${windowEnded ? "Window ended" : "Window in progress"} · incomplete inputs`,
    disclosures: [
      "Refund data is not modelled in this prototype. No refund amount has been assumed.",
      `Estimated payment fees at configured rate (${policy.paymentFeeBps / 100}%) — not an actual settled Razorpay fee record.`,
      "Includes modelled costs incurred up to the measurement cutoff. Irrevocably committed future costs are not modelled.",
      "Modelled from planned service dates; actual delivery is not recorded.",
    ],
    inputs: { cashPrePaise: collected.prePaise, estimatedFeesPaise, costsIncurredPaise, cutoff },
  };
}
