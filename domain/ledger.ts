import type { CollectionAttempt } from "./collections";
import { compareDates, localDateOf, type CalendarDate } from "./dates";
import { sum, type Paise } from "./money";
import type { Structure } from "./structures";

/**
 * Agreement ledger. Every amount is stored separately. Unpaid service value and funding
 * requirement are different concepts and are never added together.
 */
export interface Ledger {
  asOf: CalendarDate;
  contract: { prePaise: Paise; gstPaise: Paise; totalPaise: Paise };
  collected: { prePaise: Paise; gstPaise: Paise; totalPaise: Paise };
  balance: { prePaise: Paise; gstPaise: Paise; totalPaise: Paise };
  unpaidServiceValuePaise: Paise;
  fundingRequirementPaise: Paise;
  remainingDeliveryValuePaise: Paise;
  fullyPaid: boolean;
}

export function receiptDate(a: CollectionAttempt, timeZone: string): CalendarDate | null {
  const ev = a.history.find((h) => h.status === "succeeded");
  return ev ? localDateOf(ev.at, timeZone) : null;
}

export function computeLedger(args: { structure: Structure; attempts: CollectionAttempt[]; asOf: CalendarDate; timeZone: string }): Ledger {
  const { structure: s, attempts, asOf, timeZone } = args;
  const paid = attempts.filter((a) => {
    const d = a.status === "succeeded" ? receiptDate(a, timeZone) : null;
    return d !== null && compareDates(d, asOf) <= 0;
  });
  const contract = {
    prePaise: sum(s.payments.map((p) => p.prePaise)),
    gstPaise: sum(s.payments.map((p) => p.gstPaise)),
    totalPaise: sum(s.payments.map((p) => p.totalPaise)),
  };
  const collected = {
    prePaise: sum(paid.map((a) => a.prePaise)),
    gstPaise: sum(paid.map((a) => a.gstPaise)),
    totalPaise: sum(paid.map((a) => a.amountPaise)),
  };
  const upTo = (d: CalendarDate) => compareDates(d, asOf) <= 0;
  const costs = sum(s.deliveries.filter((d) => upTo(d.costDate)).map((d) => d.costPaise));
  const delivered = sum(s.deliveries.filter((d) => upTo(d.deliveredDate)).map((d) => d.valuePaise));
  return {
    asOf,
    contract,
    collected,
    balance: {
      prePaise: contract.prePaise - collected.prePaise,
      gstPaise: contract.gstPaise - collected.gstPaise,
      totalPaise: contract.totalPaise - collected.totalPaise,
    },
    unpaidServiceValuePaise: Math.max(0, delivered - collected.prePaise),
    fundingRequirementPaise: Math.max(0, costs - collected.prePaise),
    remainingDeliveryValuePaise: s.pricePaise - delivered,
    fullyPaid: collected.totalPaise >= contract.totalPaise,
  };
}
