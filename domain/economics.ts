import { compareDates, type CalendarDate } from "./dates";
import { divRoundHalfUp, sum, type Paise } from "./money";
import type { Structure } from "./structures";
import type { MerchantPolicy } from "./types";

/**
 * Seller economics, using the freeze-pack definitions exactly:
 * - Funding requirement(d) = max(0, direct costs incurred ≤ d − cash received excl. GST ≤ d)
 * - Peak funding requirement = max over the timeline; cash at risk over time = the series
 * - Unpaid service value(d) = max(0, pre-GST value delivered ≤ d − cash received excl. GST ≤ d)
 * - Gross contribution = accepted pre-GST price − total direct delivery costs
 * - Net contribution = gross contribution − expected payment fees
 * Unpaid service value and funding requirement are separate series and are never added.
 */
export interface EconomicsPoint {
  date: CalendarDate;
  costsIncurredPaise: Paise;
  cashReceivedPrePaise: Paise;
  valueDeliveredPaise: Paise;
  fundingRequirementPaise: Paise;
  unpaidServiceValuePaise: Paise;
  remainingDeliveryValuePaise: Paise;
}

export interface Economics {
  pricePaise: Paise;
  directCostPaise: Paise;
  grossContributionPaise: Paise;
  expectedFeesPaise: Paise;
  netContributionPaise: Paise;
  /** Net contribution as bps of accepted pre-GST price (0 when price is 0). */
  netContributionBps: number;
  series: EconomicsPoint[];
  peakFundingPaise: Paise;
  peakFundingDate: CalendarDate | null;
  peakUnpaidServiceValuePaise: Paise;
}

export interface Receipt {
  date: CalendarDate;
  prePaise: Paise;
}

export function expectedFee(totalPaise: Paise, feeBps: number): Paise {
  return divRoundHalfUp(totalPaise * feeBps, 10_000);
}

/** Planned receipts: every scheduled payment collected on its due date. */
export function plannedReceipts(s: Structure): Receipt[] {
  return s.payments.map((p) => ({ date: p.dueDate, prePaise: p.prePaise }));
}

export function computeEconomics(s: Structure, policy: MerchantPolicy, receipts: Receipt[] = plannedReceipts(s)): Economics {
  const dates = [...new Set([...s.deliveries.flatMap((d) => [d.costDate, d.deliveredDate]), ...receipts.map((r) => r.date)])].sort(compareDates);
  const upTo = <T extends { date: CalendarDate }>(xs: T[], d: CalendarDate) => xs.filter((x) => compareDates(x.date, d) <= 0);
  const costs = s.deliveries.map((d) => ({ date: d.costDate, v: d.costPaise }));
  const delivered = s.deliveries.map((d) => ({ date: d.deliveredDate, v: d.valuePaise }));

  const series: EconomicsPoint[] = dates.map((date) => {
    const costsIncurredPaise = sum(upTo(costs, date).map((x) => x.v));
    const cashReceivedPrePaise = sum(upTo(receipts, date).map((x) => x.prePaise));
    const valueDeliveredPaise = sum(upTo(delivered, date).map((x) => x.v));
    return {
      date,
      costsIncurredPaise,
      cashReceivedPrePaise,
      valueDeliveredPaise,
      fundingRequirementPaise: Math.max(0, costsIncurredPaise - cashReceivedPrePaise),
      unpaidServiceValuePaise: Math.max(0, valueDeliveredPaise - cashReceivedPrePaise),
      remainingDeliveryValuePaise: s.pricePaise - valueDeliveredPaise,
    };
  });

  let peakFundingPaise = 0;
  let peakFundingDate: CalendarDate | null = null;
  for (const p of series) {
    if (p.fundingRequirementPaise > peakFundingPaise) {
      peakFundingPaise = p.fundingRequirementPaise;
      peakFundingDate = p.date;
    }
  }

  const grossContributionPaise = s.pricePaise - s.directCostPaise;
  const expectedFeesPaise = sum(s.payments.map((p) => expectedFee(p.totalPaise, policy.paymentFeeBps)));
  const netContributionPaise = grossContributionPaise - expectedFeesPaise;
  return {
    pricePaise: s.pricePaise,
    directCostPaise: s.directCostPaise,
    grossContributionPaise,
    expectedFeesPaise,
    netContributionPaise,
    netContributionBps: s.pricePaise > 0 ? Math.floor((netContributionPaise * 10_000) / s.pricePaise) : 0,
    series,
    peakFundingPaise,
    peakFundingDate,
    peakUnpaidServiceValuePaise: Math.max(0, ...series.map((p) => p.unpaidServiceValuePaise)),
  };
}
