import type { EconomicsContent } from "@/domain/business-economics";
import { defaultEconomicsContent } from "@/lib/economics-default";

export const SEEDS = Array.from({ length: 200 }, (_, index) => index + 1);

/** Mulberry32: deterministic, small and sufficient for repeatable property inputs. */
export function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const integer = (next: () => number, min: number, max: number) => min + Math.floor(next() * (max - min + 1));
const pick = <T>(next: () => number, values: readonly T[]): T => values[Math.floor(next() * values.length)]!;

export function genEconomics(next: () => number): EconomicsContent {
  const content = defaultEconomicsContent();
  for (const service of content.services) {
    service.directCostPaise = integer(next, 0, Math.round(service.listPricePaise * 1.2));
  }

  const ceiling = pick(next, [0, 500, 1000, 2000] as const);
  const possibleLevels = [500, 1000, 2000].filter((level) => level <= ceiling);
  content.guardrails = {
    ...content.guardrails,
    contributionFloor: { minPercentBps: integer(next, 0, 6000), minPaise: null, combine: "both" },
    cashAtRiskLimitPaise: integer(next, 0, 5_000_000),
    discountLimitBps: ceiling,
    smallestInstalmentPaise: integer(next, 100_000, 2_000_000),
    maxTenureMonths: integer(next, 3, 18),
    paymentFeeBps: integer(next, 0, 500),
  };
  content.discountLadderBps = [0, ...possibleLevels.filter(() => next() >= 0.5)];
  return content;
}
