import { canonicalJson, type CanonicalTerms } from "@/domain/agreement";

export type AmendmentDifferenceCategory = "payment_date" | "planned_invoice_date" | "amount" | "scope" | "service_period" | "mandate";

export interface AmendmentDifference {
  category: AmendmentDifferenceCategory;
  lineId: string | null;
  changed: boolean;
  before: string | null;
  after: string | null;
  qualifier: "planned_not_issued" | "still_fits" | null;
}

const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

/** Complete contractual difference between two agreement versions, compared by stable IDs. */
export function amendmentDiff(from: CanonicalTerms, to: CanonicalTerms): AmendmentDifference[] {
  const differences: AmendmentDifference[] = [];
  const toPayments = new Map(to.paymentSchedule.map((line) => [line.id, line]));
  for (const before of from.paymentSchedule) {
    const after = toPayments.get(before.id);
    if (after && before.dueDate.value !== after.dueDate.value) {
      differences.push({ category: "payment_date", lineId: before.id, changed: true, before: before.dueDate.value, after: after.dueDate.value, qualifier: null });
    }
  }
  const toInvoices = new Map(to.invoiceSchedule.map((line) => [line.id, line]));
  for (const before of from.invoiceSchedule) {
    const after = toInvoices.get(before.id);
    if (after && before.invoiceDate.value !== after.invoiceDate.value) {
      differences.push({ category: "planned_invoice_date", lineId: before.id, changed: true, before: before.invoiceDate.value, after: after.invoiceDate.value, qualifier: "planned_not_issued" });
    }
  }

  const amountsBefore = { pricing: from.pricing, payments: from.paymentSchedule.map(({ id, prePaise, gstPaise, totalPaise }) => ({ id, prePaise, gstPaise, totalPaise })) };
  const amountsAfter = { pricing: to.pricing, payments: to.paymentSchedule.map(({ id, prePaise, gstPaise, totalPaise }) => ({ id, prePaise, gstPaise, totalPaise })) };
  differences.push({ category: "amount", lineId: null, changed: !same(amountsBefore, amountsAfter), before: String(from.pricing.totalPaise), after: String(to.pricing.totalPaise), qualifier: null });

  const scopeBefore = { scope: from.scope, excluded: from.excludedPackageIds };
  const scopeAfter = { scope: to.scope, excluded: to.excludedPackageIds };
  differences.push({ category: "scope", lineId: null, changed: !same(scopeBefore, scopeAfter), before: canonicalJson(scopeBefore), after: canonicalJson(scopeAfter), qualifier: null });

  differences.push({ category: "service_period", lineId: null, changed: !same(from.deliverySchedule, to.deliverySchedule), before: canonicalJson(from.deliverySchedule), after: canonicalJson(to.deliverySchedule), qualifier: null });

  const recurring = to.paymentSchedule.filter((line) => line.method === "recurring_debit");
  const stillFits = !!to.mandate && recurring.every((line) => line.totalPaise <= to.mandate!.perDebitLimitPaise && line.dueDate.value <= to.mandate!.endDate.value);
  differences.push({ category: "mandate", lineId: null, changed: !same(from.mandate, to.mandate), before: from.mandate ? canonicalJson(from.mandate) : null, after: to.mandate ? canonicalJson(to.mandate) : null, qualifier: stillFits ? "still_fits" : null });
  return differences;
}
