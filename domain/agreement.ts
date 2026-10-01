import { createHash } from "node:crypto";
import type { Clock } from "./clock";
import { addMonthsToMonth, endOfMonth, monthOf, type CalendarDate } from "./dates";
import type { EvaluatedStructure } from "./engine";
import { CURRENCY, sum, type Paise } from "./money";
import type { Structure } from "./structures";
import type { MerchantPolicy } from "./types";

export const TERMS_SCHEMA_VERSION = "adaptive-deals.terms.v1";

export interface MandateTerms {
  perDebitLimitPaise: Paise;
  endDate: { value: CalendarDate; precision: "day" };
}

/** Contractual terms only. No display state, run time, UI state or status timestamps. */
export interface CanonicalTerms {
  schemaVersion: typeof TERMS_SCHEMA_VERSION;
  currency: typeof CURRENCY;
  dealId: string;
  merchantId: string;
  buyerId: string;
  structure: { template: string; params: Record<string, string | number>; scopeKind: string };
  scope: { packageId: string; months: number }[];
  excludedPackageIds: string[];
  pricing: { listPricePaise: Paise; discountBps: number; prePaise: Paise; gstPaise: Paise; totalPaise: Paise; gstRateBps: number };
  deliverySchedule: { packageId: string; month: { value: string; precision: "month" }; valuePaise: Paise }[];
  invoiceSchedule: { id: string; paymentLineId: string; invoiceDate: { value: CalendarDate; precision: "day" }; prePaise: Paise; gstPaise: Paise; totalPaise: Paise }[];
  paymentSchedule: { id: string; seq: number; dueDate: { value: CalendarDate; precision: "day" }; method: string; prePaise: Paise; gstPaise: Paise; totalPaise: Paise }[];
  mandate: MandateTerms | null;
  conditions: string[];
}

/** Per-debit limit = the largest recurring debit shown to the buyer; end date = end of month after a buffer. */
export function deriveMandateTerms(s: Structure, policy: MerchantPolicy): MandateTerms | null {
  const recurring = s.payments.filter((p) => p.method === "recurring_debit");
  if (!recurring.length) return null;
  const last = recurring.map((p) => p.dueDate).sort().at(-1)!;
  return {
    perDebitLimitPaise: Math.max(...recurring.map((p) => p.totalPaise)),
    endDate: { value: endOfMonth(addMonthsToMonth(monthOf(last), policy.mandateEndBufferMonths)), precision: "day" },
  };
}

export function buildCanonicalTerms(args: { dealId: string; merchantId: string; buyerId: string; structure: Structure; gstRateBps: number; mandate: MandateTerms | null }): CanonicalTerms {
  const s = args.structure;
  return {
    schemaVersion: TERMS_SCHEMA_VERSION,
    currency: CURRENCY,
    dealId: args.dealId,
    merchantId: args.merchantId,
    buyerId: args.buyerId,
    structure: { template: s.template, params: s.params, scopeKind: s.scopeKind },
    scope: s.scope.map((x) => ({ packageId: x.packageId, months: x.months })),
    excludedPackageIds: [...s.excludedPackageIds],
    pricing: {
      listPricePaise: s.listPricePaise,
      discountBps: s.discountBps,
      prePaise: s.pricePaise,
      gstPaise: sum(s.payments.map((p) => p.gstPaise)),
      totalPaise: sum(s.payments.map((p) => p.totalPaise)),
      gstRateBps: args.gstRateBps,
    },
    deliverySchedule: s.deliveries.map((d) => ({ packageId: d.packageId, month: { value: d.month, precision: "month" as const }, valuePaise: d.valuePaise })),
    invoiceSchedule: s.invoices.map((i) => ({ id: i.id, paymentLineId: i.paymentLineId, invoiceDate: { value: i.invoiceDate, precision: "day" as const }, prePaise: i.prePaise, gstPaise: i.gstPaise, totalPaise: i.totalPaise })),
    paymentSchedule: s.payments.map((p) => ({ id: p.id, seq: p.seq, dueDate: { value: p.dueDate, precision: "day" as const }, method: p.method, prePaise: p.prePaise, gstPaise: p.gstPaise, totalPaise: p.totalPaise })),
    mandate: args.mandate,
    conditions: [...s.requirements],
  };
}

/** Stable serialisation: object keys sorted recursively, arrays kept in order, no undefined. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Non-finite number in canonical terms");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function termsHash(terms: CanonicalTerms): string {
  return createHash("sha256").update(canonicalJson(terms), "utf8").digest("hex");
}

// ── Agreement versions, approval and acceptance ─────────────────────────────

export type AgreementStatus = "draft" | "merchant_approved" | "sent" | "accepted" | "active" | "superseded" | "merchant_rejected" | "buyer_rejected";

export interface Signature {
  by: string;
  at: string;
  termsHash: string;
}

export interface AgreementVersion {
  agreementId: string;
  version: number;
  structureId: string;
  terms: CanonicalTerms;
  termsHash: string;
  createdAt: string;
  status: AgreementStatus;
  merchantApproval: Signature | null;
  buyerAcceptance: (Signature & { authorityConfirmed: boolean }) | null;
  /** Set when the buyer declines a sent version. */
  buyerDecline?: { by: string; at: string };
  supersedes: number | null;
}

export class AgreementError extends Error {}

export function createAgreementVersion(args: {
  agreementId: string;
  version: number;
  evaluated: EvaluatedStructure;
  dealId: string;
  merchantId: string;
  buyerId: string;
  policy: MerchantPolicy;
  clock: Clock;
  supersedes?: number | null;
}): AgreementVersion {
  if (!args.evaluated.approvable) {
    throw new AgreementError(`Structure ${args.evaluated.structure.id} is ${args.evaluated.verdict}; only feasible structures can become agreements`);
  }
  const terms = buildCanonicalTerms({
    dealId: args.dealId,
    merchantId: args.merchantId,
    buyerId: args.buyerId,
    structure: args.evaluated.structure,
    gstRateBps: args.policy.gstRateBps,
    mandate: deriveMandateTerms(args.evaluated.structure, args.policy),
  });
  return {
    agreementId: args.agreementId,
    version: args.version,
    structureId: args.evaluated.structure.id,
    terms,
    termsHash: termsHash(terms),
    createdAt: args.clock.now(),
    status: "draft",
    merchantApproval: null,
    buyerAcceptance: null,
    supersedes: args.supersedes ?? null,
  };
}

function assertHashCurrent(v: AgreementVersion, presentedHash: string) {
  const recomputed = termsHash(v.terms);
  if (recomputed !== v.termsHash) throw new AgreementError("Stored terms no longer match their hash");
  if (presentedHash !== v.termsHash) throw new AgreementError(`Presented hash ${presentedHash.slice(0, 12)}… does not match version ${v.version} (${v.termsHash.slice(0, 12)}…)`);
}

export function merchantApprove(v: AgreementVersion, presentedHash: string, by: string, clock: Clock): AgreementVersion {
  if (v.status !== "draft") throw new AgreementError(`Cannot approve a ${v.status} agreement version`);
  assertHashCurrent(v, presentedHash);
  return { ...v, status: "merchant_approved", merchantApproval: { by, at: clock.now(), termsHash: presentedHash } };
}

export function markSent(v: AgreementVersion): AgreementVersion {
  if (v.status !== "merchant_approved") throw new AgreementError("Only a merchant-approved version can be sent");
  return { ...v, status: "sent" };
}

export function buyerAccept(v: AgreementVersion, presentedHash: string, by: string, clock: Clock, opts: { authorityConfirmed: boolean }): AgreementVersion {
  if (v.status !== "sent") throw new AgreementError(`Cannot accept a ${v.status} agreement version`);
  assertHashCurrent(v, presentedHash);
  if (v.terms.conditions.includes("buyer_confirms_authority_for_phase_scope") && !opts.authorityConfirmed) {
    throw new AgreementError("The buyer must confirm authority to purchase this phase scope");
  }
  return { ...v, status: "accepted", buyerAcceptance: { by, at: clock.now(), termsHash: presentedHash, authorityConfirmed: opts.authorityConfirmed } };
}

/** The buyer declines a sent version. No payment setup follows. */
export function buyerReject(v: AgreementVersion, by: string, clock: Clock): AgreementVersion {
  if (v.status !== "sent") throw new AgreementError(`Cannot decline a ${v.status} agreement version`);
  return { ...v, status: "buyer_rejected", buyerDecline: { by, at: clock.now() } };
}

export function hashesMatch(v: AgreementVersion): boolean {
  return !!v.merchantApproval && !!v.buyerAcceptance && v.merchantApproval.termsHash === v.termsHash && v.buyerAcceptance.termsHash === v.termsHash && termsHash(v.terms) === v.termsHash;
}

export function activate(v: AgreementVersion): AgreementVersion {
  if (v.status !== "accepted") throw new AgreementError("Only an accepted version can be activated");
  if (!hashesMatch(v)) throw new AgreementError("Merchant approval and buyer acceptance must carry the same terms hash");
  return { ...v, status: "active" };
}

/** Gate for every payment API call. */
export function assertPaymentsUnlocked(v: AgreementVersion): void {
  if (!hashesMatch(v)) throw new AgreementError("Payment actions require matching merchant-approval and buyer-acceptance hashes");
  if (v.status !== "active" && v.status !== "accepted") throw new AgreementError(`Payment actions are not available for a ${v.status} version`);
}
