import type { CheckResult } from "./checks";
import type { EvaluatedStructure } from "./engine";
import { derivePreGstFromInclusive, divRoundHalfUp, lineWithGst, sum, type Paise } from "./money";
import type { Structure } from "./structures";

export class CounterError extends Error {}

/** A total the merchant set themselves, as opposed to an offer the engine listed. */
export const isCounterStructureId = (id: string): boolean => id.includes("#counter@");

/** Split `total` across parts in proportion to `weights`; the rounding remainder goes to `remainderAt`. */
function proportional(total: Paise, weights: Paise[], remainderAt: "first" | "last"): Paise[] {
  const weightSum = sum(weights);
  if (weightSum <= 0) throw new CounterError("The offer has no value to scale");
  const parts = weights.map((w) => Math.floor((total * w) / weightSum));
  parts[remainderAt === "first" ? 0 : parts.length - 1] += total - sum(parts);
  return parts;
}

/**
 * The merchant's counter to a buyer's request for a different total (including GST): the same scope,
 * dates and payment methods, with every payment line scaled in proportion and GST recomputed per
 * line by the same rule the engine uses. The discount against list price is recorded; direct costs
 * are unchanged, so the engine sees the real contribution. It is a candidate only: the engine must
 * recheck it, and nothing here makes it eligible.
 */
export function counterStructure(base: Structure, targetTotalPaise: Paise, gstRateBps: number): Structure {
  if (!Number.isInteger(targetTotalPaise) || targetTotalPaise <= 0) throw new CounterError("The total must be a positive whole number of paise");
  const currentTotal = sum(base.payments.map((p) => p.totalPaise));
  if (targetTotalPaise >= currentTotal) throw new CounterError("A counter-offer must be lower than the current offer");

  // Per-line GST rounding means the aggregate price is only a starting point. Try the prices around it: an exact
  // landing on what the merchant typed if one exists, otherwise the closest total that does not exceed it.
  const basePre = derivePreGstFromInclusive(targetTotalPaise, gstRateBps).prePaise;
  const lines = (pre: Paise) => {
    const parts = proportional(pre, base.payments.map((p) => p.prePaise), "first");
    return base.payments.map((p, i) => ({ ...p, ...lineWithGst(parts[i], gstRateBps) }));
  };
  const totalFor = (pre: Paise) => sum(lines(pre).map((p) => p.totalPaise));
  let pre = basePre;
  let best = -Infinity;
  for (let candidate = basePre - 4; candidate <= basePre + 4; candidate++) {
    if (candidate <= 0) continue;
    const t = totalFor(candidate);
    if (t <= targetTotalPaise && t > best) {
      best = t;
      pre = candidate;
    }
  }
  const payments = lines(pre);
  const pricePaise = sum(payments.map((p) => p.prePaise));
  const invoices = base.invoices.map((inv) => {
    const line = payments.find((p) => p.id === inv.paymentLineId);
    return line ? { ...inv, prePaise: line.prePaise, gstPaise: line.gstPaise, totalPaise: line.totalPaise } : inv;
  });
  const valueParts = proportional(pricePaise, base.deliveries.map((d) => d.valuePaise), "last");
  const deliveries = base.deliveries.map((d, i) => ({ ...d, valuePaise: valueParts[i] }));
  // Rounded up: any real price cut is at least 1 bp of discount, so a 'no discount' rule cannot be slipped past by rounding.
  const cutBps = base.listPricePaise > 0 ? Math.max(0, Math.ceil(((base.listPricePaise - pricePaise) * 10_000) / base.listPricePaise)) : 0;
  const discountBps = Math.max(base.discountBps, cutBps);

  return {
    ...base,
    id: `${base.id}#counter@${targetTotalPaise}`,
    label: `${base.label} · your counter-offer`,
    params: { ...base.params, counter_total_paise: targetTotalPaise },
    discountBps,
    pricePaise,
    payments,
    invoices,
    deliveries,
  };
}

/**
 * The same offer with one service taken out: the dates, payment methods and discount rate are kept, the price falls by that
 * service's agreed value, and every payment line is scaled in proportion with GST recomputed per line by the engine's own rule.
 * A candidate only: the engine must recheck it (buyer's required services, dependencies, which services may be removed, the
 * merchant's limits), and nothing here makes it eligible.
 */
export function scopeReducedStructure(base: Structure, removePackageId: string, removeName: string, gstRateBps: number): Structure {
  if (!base.scope.some((item) => item.packageId === removePackageId)) throw new CounterError("That service is not in the offer");
  const scope = base.scope.filter((item) => item.packageId !== removePackageId);
  if (!scope.length) throw new CounterError("An offer needs at least one service");
  const removed = base.deliveries.filter((d) => d.packageId === removePackageId);
  const deliveries = base.deliveries.filter((d) => d.packageId !== removePackageId);
  const removedValue = sum(removed.map((d) => d.valuePaise));
  const pricePaise = base.pricePaise - removedValue;
  if (pricePaise <= 0) throw new CounterError("The offer has no value left");
  const removedList = base.discountBps >= 10_000 ? removedValue : divRoundHalfUp(removedValue * 10_000, 10_000 - base.discountBps);
  const parts = proportional(pricePaise, base.payments.map((p) => p.prePaise), "first");
  const payments = base.payments.map((p, i) => ({ ...p, ...lineWithGst(parts[i], gstRateBps) }));
  const invoices = base.invoices.map((inv) => {
    const line = payments.find((p) => p.id === inv.paymentLineId);
    return line ? { ...inv, prePaise: line.prePaise, gstPaise: line.gstPaise, totalPaise: line.totalPaise } : inv;
  });
  return {
    ...base,
    id: `${base.id}#counter@scope-${removePackageId}`,
    label: `${base.label} · without ${removeName}`,
    params: { ...base.params, counter_scope_removed: removePackageId, counter_scope_removed_name: removeName },
    scope,
    excludedPackageIds: [...base.excludedPackageIds, removePackageId],
    listPricePaise: base.listPricePaise - removedList,
    pricePaise,
    directCostPaise: sum(deliveries.map((d) => d.costPaise)),
    payments,
    invoices,
    deliveries,
  };
}

/** The checks an evaluated counter-offer does not meet, for display and for an explicit override. */
export function failingCounterChecks(x: EvaluatedStructure): CheckResult[] {
  return [...x.buyerChecks, ...x.sellerChecks].filter((c) => c.status === "fail" || c.status === "needs_information");
}
