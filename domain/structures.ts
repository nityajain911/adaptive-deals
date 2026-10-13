import { addMonths, endOfMonth, monthOf, type CalendarDate, type YearMonth } from "./dates";
import { allocateByWeights, allocateEqually, divRoundHalfUp, lineWithGst, sum, type Paise } from "./money";
import type { PaymentPlan, ScopeItem, ServicePackage, TemplateConfig, TemplateType } from "./types";

export interface PaymentLine {
  id: string;
  seq: number;
  dueDate: CalendarDate;
  prePaise: Paise;
  gstPaise: Paise;
  totalPaise: Paise;
  /** The first payment uses a payment link; later payments are recurring debits under a mandate. */
  method: "payment_link" | "recurring_debit";
}

export interface InvoiceLine {
  id: string;
  paymentLineId: string;
  invoiceDate: CalendarDate;
  description: string;
  prePaise: Paise;
  gstPaise: Paise;
  totalPaise: Paise;
}

export interface DeliveryLine {
  id: string;
  packageId: string;
  packageName: string;
  month: YearMonth;
  /** Direct cost committed at the start of the delivery month. */
  costDate: CalendarDate;
  costPaise: Paise;
  /** Agreed pre-GST value counted as delivered at the end of the delivery month. */
  deliveredDate: CalendarDate;
  valuePaise: Paise;
}

export interface Structure {
  id: string;
  template: TemplateType;
  params: Record<string, string | number>;
  label: string;
  scopeKind: "full" | "phase_1" | "shorter_term";
  scope: ScopeItem[];
  excludedPackageIds: string[];
  startDate: CalendarDate;
  discountBps: number;
  listPricePaise: Paise;
  pricePaise: Paise;
  directCostPaise: Paise;
  payments: PaymentLine[];
  invoices: InvoiceLine[];
  deliveries: DeliveryLine[];
  /** Conditions to record at acceptance, e.g. buyer authority for a smaller phase. */
  requirements: ("buyer_confirms_authority_for_phase_scope")[];
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (d: CalendarDate) => `${MONTH_NAMES[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

export function buildStructure(args: {
  template: TemplateType;
  params: Record<string, string | number>;
  label: string;
  scopeKind: Structure["scopeKind"];
  scope: ScopeItem[];
  fullScope: ScopeItem[];
  startDate: CalendarDate;
  plan: PaymentPlan;
  discountBps: number;
  packages: ServicePackage[];
  gstRateBps: number;
}): Structure {
  const { template, params, scope, startDate, plan, discountBps, packages, gstRateBps } = args;
  const pkg = (id: string) => {
    const p = packages.find((x) => x.id === id);
    if (!p) throw new Error(`Unknown package ${id}`);
    return p;
  };

  const rawDeliveries: Omit<DeliveryLine, "id" | "valuePaise">[] = [];
  const listValues: Paise[] = [];
  for (const item of scope) {
    const p = pkg(item.packageId);
    const months = p.kind === "one_time" ? 1 : item.months;
    for (let i = 0; i < months; i++) {
      const monthStart = addMonths(startDate, i);
      const month = monthOf(monthStart);
      rawDeliveries.push({ packageId: p.id, packageName: p.name, month, costDate: monthStart, costPaise: p.directCostPaise, deliveredDate: endOfMonth(month) });
      listValues.push(p.listPricePaise);
    }
  }
  const listPricePaise = sum(listValues);
  const pricePaise = listPricePaise - divRoundHalfUp(listPricePaise * discountBps, 10_000);

  // Spread any discount across delivery lines; remainder goes to the last line.
  const values = listValues.map((v) => (discountBps === 0 ? v : Math.floor((v * (10_000 - discountBps)) / 10_000)));
  values[values.length - 1] += pricePaise - sum(values);
  const deliveries: DeliveryLine[] = rawDeliveries
    .map((d, i) => ({ ...d, id: `dl-${i + 1}`, valuePaise: values[i] }))
    .sort((a, b) => (a.costDate < b.costDate ? -1 : a.costDate > b.costDate ? 1 : 0));

  const amounts = plan.weightsBps ? allocateByWeights(pricePaise, plan.weightsBps) : allocateEqually(pricePaise, plan.offsetsMonths.length);
  const payments: PaymentLine[] = plan.offsetsMonths.map((offset, i) => {
    const line = lineWithGst(amounts[i], gstRateBps);
    return {
      id: `pay-${i + 1}`,
      seq: i + 1,
      dueDate: addMonths(startDate, offset),
      ...line,
      method: i === 0 ? "payment_link" : "recurring_debit",
    };
  });
  const invoices: InvoiceLine[] = payments.map((p) => ({
    id: `inv-${p.seq}`,
    paymentLineId: p.id,
    invoiceDate: p.dueDate,
    description: `${args.label} — instalment ${p.seq} of ${payments.length}`,
    prePaise: p.prePaise,
    gstPaise: p.gstPaise,
    totalPaise: p.totalPaise,
  }));

  const included = new Set(scope.map((s) => s.packageId));
  return {
    id: `${template}:${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(",")}`,
    template,
    params,
    label: args.label,
    scopeKind: args.scopeKind,
    scope,
    excludedPackageIds: args.fullScope.map((s) => s.packageId).filter((id) => !included.has(id)),
    startDate,
    discountBps,
    listPricePaise,
    pricePaise,
    directCostPaise: sum(deliveries.map((d) => d.costPaise)),
    payments,
    invoices,
    deliveries,
    requirements: args.scopeKind === "phase_1" ? ["buyer_confirms_authority_for_phase_scope"] : [],
  };
}

/**
 * Enumerate every merchant-approved template across its full parameter grid.
 * Nothing is filtered here: every combination goes to the checks.
 */
export function enumerateStructures(templates: TemplateConfig, packages: ServicePackage[], gstRateBps: number): Structure[] {
  const out: Structure[] = [];
  const common = { fullScope: templates.fullScope, packages, gstRateBps };
  const start = templates.defaultStartDate;

  for (const discountBps of templates.discountsBps) {
    const disc: Record<string, number> = discountBps ? { discount_bps: discountBps } : {};
    const discLabel = discountBps ? ` · ${discountBps / 100}% discount` : "";
    // A discount level may be limited to some templates (a price the buyer wants matched for the year makes no sense for a short commitment).
    const on = (template: TemplateType) => discountBps === 0 || !templates.discountOn || templates.discountOn.includes(template);

    if (templates.split_payment.enabled && on("split_payment")) {
      for (const plan of templates.split_payment.plans) {
        out.push(buildStructure({ ...common, template: "split_payment", params: { plan: plan.id, ...disc }, label: `Full annual scope · ${plan.label}${discLabel}`, scopeKind: "full", scope: templates.fullScope, startDate: start, plan, discountBps }));
      }
    }
    if (templates.phased_scope.enabled && on("phased_scope")) {
      for (const preset of templates.phased_scope.phase1Scopes) {
        for (const plan of templates.phased_scope.plans) {
          out.push(buildStructure({ ...common, template: "phased_scope", params: { scope: preset.id, plan: plan.id, ...disc }, label: `Phase 1: ${preset.label} · ${plan.label}${discLabel}`, scopeKind: "phase_1", scope: preset.items, startDate: start, plan, discountBps }));
        }
      }
    }
    if (templates.deferred_start.enabled && on("deferred_start")) {
      for (const startDate of templates.deferred_start.startDates) {
        for (const plan of templates.deferred_start.plans) {
          out.push(buildStructure({ ...common, template: "deferred_start", params: { start: startDate, plan: plan.id, ...disc }, label: `Full annual scope from ${monthLabel(startDate)} · ${plan.label}${discLabel}`, scopeKind: "full", scope: templates.fullScope, startDate, plan, discountBps }));
        }
      }
    }
    if (templates.shorter_commitment.enabled && on("shorter_commitment")) {
      for (const { termMonths: term, plans } of templates.shorter_commitment.terms) {
        const scope = templates.fullScope.map((s) => ({ ...s, months: Math.min(s.months, term) }));
        for (const plan of plans) {
          out.push(buildStructure({ ...common, template: "shorter_commitment", params: { term_months: term, plan: plan.id, ...disc }, label: `${term}-month commitment · ${plan.label}${discLabel}`, scopeKind: "shorter_term", scope, startDate: start, plan, discountBps }));
        }
      }
    }
  }
  return out;
}
