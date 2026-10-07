import type { CheckResult } from "./checks";
import type { EvaluatedStructure } from "./engine";
import { derivePreGstFromInclusive, divRoundHalfUp, lineWithGst, sum, type Paise } from "./money";
import type { Structure } from "./structures";

export class CounterError extends Error {}

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
  const discountBps = base.listPricePaise > 0 ? Math.max(base.discountBps, divRoundHalfUp((base.listPricePaise - pricePaise) * 10_000, base.listPricePaise)) : base.discountBps;

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

/** The checks an evaluated counter-offer does not meet, for display and for an explicit override. */
export function failingCounterChecks(x: EvaluatedStructure): CheckResult[] {
  return [...x.buyerChecks, ...x.sellerChecks].filter((c) => c.status === "fail" || c.status === "needs_information");
}
