import type { EvaluatedStructure } from "@/domain/engine";
import type { CounterOffer } from "./deal-records";

/** The merchant's live counter-offer, if it carries an override of rules the engine reported as failed. */
export function liveOverriddenCounter(s: { counterOffers: CounterOffer[] }): CounterOffer | null {
  const live = s.counterOffers.at(-1);
  return live?.override ? live : null;
}

/**
 * The structures that may become a draft: those the engine approved, plus the live counter-offer the
 * merchant explicitly overrode. The engine's own `approvable` is never changed to make this so.
 */
export function eligibleStructures(s: { counterOffers: CounterOffer[] }, structures: EvaluatedStructure[]): EvaluatedStructure[] {
  const overridden = liveOverriddenCounter(s)?.evaluated.structure.id;
  return structures.filter((x) => x.approvable || x.structure.id === overridden);
}
