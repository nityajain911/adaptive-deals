import type { CorridorView } from "@/lib/service";

export type NegotiationStep = "choose" | "check" | "exception";

/**
 * A small, presentation-only model for a merchant answering a price request. It never mutates the
 * corridor or its engine result: an exception remains an exception even when the merchant decides
 * to prepare a counter-offer.
 */
export function negotiationView(args: { corridor: CorridorView; buyerRequest: string; step: NegotiationStep }) {
  const { corridor, buyerRequest, step } = args;
  const check = corridor.check;
  const failed = check?.rules.filter((rule) => !rule.passed) ?? [];
  const needsException = !!check && (!check.passes || check.negativeContribution);
  return {
    step,
    buyerRequest,
    anchors: {
      buyerAskedPaise: corridor.requestedTotalPaise,
      safeMinimumPaise: corridor.lowestCompliantPaise,
      currentOfferPaise: corridor.currentTotalPaise,
    },
    check: check
      ? {
          totalPaise: check.totalPaise,
          contributionPaise: check.contributionPaise,
          negativeContribution: check.negativeContribution,
          passes: check.passes,
          firstFailedRule: failed.at(0)?.text ?? null,
          failedRuleCodes: check.failing.map((rule) => rule.code),
          passedCount: check.rules.filter((rule) => rule.passed).length,
          needsException,
        }
      : null,
  };
}
