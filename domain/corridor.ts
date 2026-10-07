import { counterStructure, failingCounterChecks } from "./counter";
import { evaluateStructure, type EngineInput } from "./engine";
import { sum, type Paise } from "./money";
import type { Structure } from "./structures";
import type { BuyerConstraints } from "./types";

export const CORRIDOR_EVALUATION_LIMIT = 6000;

/** ₹100 steps to find where the rules start to fail, then ₹1 steps to find the edge. */
const COARSE: Paise = 10_000;
const FINE: Paise = 100;

export interface CorridorResult {
  currentTotalPaise: Paise;
  currentPasses: boolean;
  /** The lowest total, for the same scope and dates, that meets every rule; null when none was found or verified. */
  lowestCompliantPaise: Paise | null;
  evaluations: number;
  /** Set when the search stopped at its limit. Nothing is then offered as a lower limit. */
  unavailableReason: "evaluation_limit" | null;
}

class LimitReached extends Error {}

/**
 * The lowest total the merchant could offer for the same scope and dates without breaking any of
 * their rules or the buyer's limits. Found by evaluating real candidate offers with the real engine,
 * so GST rounding, payment schedules and every check are included. It is the lowest total in the
 * contiguous range of passing totals that starts at the current offer, to the nearest rupee.
 */
export function lowestCompliantTotal(args: { base: Structure; constraints: BuyerConstraints; engine: EngineInput; limit?: number }): CorridorResult {
  const { base, constraints, engine } = args;
  const limit = args.limit ?? CORRIDOR_EVALUATION_LIMIT;
  const gst = engine.merchant.policy.gstRateBps;
  const currentTotalPaise = sum(base.payments.map((p) => p.totalPaise));
  let evaluations = 0;
  const meetsEveryRule = (structure: Structure) => {
    if (evaluations >= limit) throw new LimitReached();
    evaluations++;
    return failingCounterChecks(evaluateStructure(structure, constraints, engine)).length === 0;
  };
  const passes = (total: Paise) => meetsEveryRule(counterStructure(base, total, gst));

  try {
    const currentPasses = meetsEveryRule(base);
    if (!currentPasses) return { currentTotalPaise, currentPasses, lowestCompliantPaise: null, evaluations, unavailableReason: null };

    let lastPass = currentTotalPaise;
    let firstFail: Paise | null = null;
    for (let total = currentTotalPaise - COARSE; total >= FINE; total -= COARSE) {
      if (passes(total)) lastPass = total;
      else {
        firstFail = total;
        break;
      }
    }
    if (firstFail === null) {
      // Nothing failed down to the last coarse step: refine below it, one rupee at a time.
      for (let total = lastPass - FINE; total >= FINE; total -= FINE) {
        if (passes(total)) lastPass = total;
        else break;
      }
      return { currentTotalPaise, currentPasses, lowestCompliantPaise: lastPass, evaluations, unavailableReason: null };
    }
    let lowest = lastPass;
    for (let total = firstFail + FINE; total < lastPass; total += FINE) {
      if (passes(total)) {
        lowest = total;
        break;
      }
    }
    return { currentTotalPaise, currentPasses, lowestCompliantPaise: lowest, evaluations, unavailableReason: null };
  } catch (e) {
    if (e instanceof LimitReached) return { currentTotalPaise, currentPasses: false, lowestCompliantPaise: null, evaluations, unavailableReason: "evaluation_limit" };
    throw e;
  }
}
