import type { EconomicsContent } from "@/domain/business-economics";

export interface WhatIfRow {
  id: string;
  name: string;
  standardPaise: number;
  /** The lowest price (before GST) the limits allow, or null when no price could reach the profit limit. */
  lowestPaise: number | null;
  /** What sets that lowest price. */
  setBy: "profit" | "discount" | "none";
}

export interface WhatIf {
  rows: WhatIfRow[];
  /** True when the profit limit cannot be met at any price (fees and the percentage leave nothing). */
  unreachable: boolean;
}

const ceilDiv = (a: number, b: number) => Math.ceil(a / b);

/**
 * What the merchant's current (unsaved) limits mean for each service, worked out the way the engine does it:
 * profit is price minus cost minus the expected payment fee, and it must meet the lowest-profit limit.
 * Indicative per service; the full check still runs when the merchant presses "Check my changes".
 */
export function whatIf(content: Pick<EconomicsContent, "services" | "guardrails"> & { fixed: Pick<EconomicsContent["fixed"], "gstRateBps"> }): WhatIf {
  const { guardrails: g } = content;
  const floor = g.contributionFloor;
  // The fee is charged on what the customer pays, GST included; 1e8 keeps whole-number maths.
  const feeScaled = Math.round((g.paymentFeeBps * (10_000 + content.fixed.gstRateBps)) / 10_000); // bps of the pre-GST price
  const rows = content.services.map((service): WhatIfRow => {
    const candidates: number[] = [];
    let blocked = false;
    if (floor.minPercentBps !== null) {
      const room = 10_000 - feeScaled - floor.minPercentBps;
      if (room <= 0) blocked = true;
      else candidates.push(ceilDiv(service.directCostPaise * 10_000, room));
    }
    if (floor.minPaise !== null) {
      const room = 10_000 - feeScaled;
      if (room <= 0) blocked = true;
      else candidates.push(ceilDiv((service.directCostPaise + floor.minPaise) * 10_000, room));
    }
    const usable = candidates.length === 0 ? null : floor.combine === "either" && candidates.length > 1 ? Math.min(...candidates) : Math.max(...candidates);
    const profitMin = blocked && candidates.length === 0 ? null : usable;
    const discountMin = Math.ceil((service.listPricePaise * (10_000 - g.discountLimitBps)) / 10_000);
    if (profitMin === null && blocked) return { id: service.id, name: service.name, standardPaise: service.listPricePaise, lowestPaise: null, setBy: "profit" };
    const lowest = Math.max(profitMin ?? 0, discountMin);
    return { id: service.id, name: service.name, standardPaise: service.listPricePaise, lowestPaise: lowest, setBy: profitMin !== null && profitMin > discountMin ? "profit" : discountMin > 0 ? "discount" : "none" };
  });
  return { rows, unreachable: rows.some((row) => row.lowestPaise === null) };
}

export interface ExampleDeal {
  /** Price before GST, direct cost, the expected payment fee and what is left, all in paise. */
  pricePaise: number;
  costPaise: number;
  feePaise: number;
  keepPaise: number;
  keepPercent: number;
  /** Whether the lowest-profit limit would let this deal be suggested. */
  suggested: boolean;
  months: number;
}

/**
 * A worked example for the limits: every service for three months at the prices and costs on screen, with the same fee
 * model as above. It is arithmetic on the merchant's own numbers, not a prediction, and it saves nothing.
 */
export function exampleDeal(content: Pick<EconomicsContent, "services" | "guardrails"> & { fixed: Pick<EconomicsContent["fixed"], "gstRateBps"> }, months = 3): ExampleDeal | null {
  if (!content.services.length) return null;
  const times = (service: (typeof content.services)[number]) => (service.kind === "monthly" ? months : 1);
  const pricePaise = content.services.reduce((n, s) => n + s.listPricePaise * times(s), 0);
  const costPaise = content.services.reduce((n, s) => n + s.directCostPaise * times(s), 0);
  if (pricePaise <= 0) return null;
  const feePaise = Math.round((pricePaise * content.guardrails.paymentFeeBps * (10_000 + content.fixed.gstRateBps)) / 100_000_000);
  const keepPaise = pricePaise - costPaise - feePaise;
  const floor = content.guardrails.contributionFloor;
  const needs: boolean[] = [];
  if (floor.minPercentBps !== null) needs.push(keepPaise * 10_000 >= floor.minPercentBps * pricePaise);
  if (floor.minPaise !== null) needs.push(keepPaise >= floor.minPaise);
  const suggested = keepPaise > 0 && (needs.length === 0 ? true : floor.combine === "either" ? needs.some(Boolean) : needs.every(Boolean));
  return { pricePaise, costPaise, feePaise, keepPaise, keepPercent: Math.round((keepPaise * 100) / pricePaise), suggested, months };
}
