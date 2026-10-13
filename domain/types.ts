import type { Paise } from "./money";
import type { CalendarDate, DateValue, Period } from "./dates";

// ── Merchant, packages, templates ────────────────────────────────────────────

export interface ContributionFloor {
  /** Minimum net contribution as basis points of accepted pre-GST price (null = not applied). */
  minPercentBps: number | null;
  /** Minimum net contribution in paise (null = not applied). */
  minPaise: Paise | null;
  /** When both are set: "both" requires both, "either" requires one. */
  combine: "both" | "either";
}

export interface MerchantPolicy {
  gstRateBps: number;
  contributionFloor: ContributionFloor;
  /** Peak funding requirement (cash at risk) may not exceed this. */
  cashAtRiskLimitPaise: Paise;
  maxTenureMonths: number;
  /** Smallest instalment, pre-GST. */
  smallestInstalmentPaise: Paise;
  discountLimitBps: number;
  /** Expected payment fee as bps of each customer-facing collection, borne by the seller. */
  paymentFeeBps: number;
  /** Adaptive Deals sends its own notice this many days before each recurring debit. */
  advanceNoticeDays: number;
  /** Day offset of an internal Adaptive Deals retry after a failed debit. */
  internalRetryAfterDays: number;
  /** Mandate end date = end of the month this many months after the last recurring debit. */
  mandateEndBufferMonths: number;
}

export interface Merchant {
  id: string;
  name: string;
  segment: string;
  timeZone: string;
  policy: MerchantPolicy;
}

export interface ServicePackage {
  id: string;
  name: string;
  /** one_time: price/cost are totals delivered in the first month. monthly: price/cost per month. */
  kind: "one_time" | "monthly";
  listPricePaise: Paise;
  directCostPaise: Paise;
  /** When the direct cost is incurred: at the start of each delivery month. */
  costTiming: "start_of_delivery_month";
  deferrable: boolean;
  removable: boolean;
  hasIndependentValue: boolean;
  /** Packages that must accompany this one for it to make sense. */
  dependsOnAny?: string[];
}

export interface ScopeItem {
  packageId: string;
  /** Delivery months for monthly packages; one_time packages always use 1. */
  months: number;
}

export interface PaymentPlan {
  id: string;
  label: string;
  /** Month offsets from delivery start at which payments fall due (on the start-date day). */
  offsetsMonths: number[];
  /** Basis-point weights summing to 10000; omitted = equal parts. */
  weightsBps?: number[];
}

export interface PhaseScopePreset {
  id: string;
  label: string;
  items: ScopeItem[];
}

export interface TemplateConfig {
  /** Full annual scope sold in every template except phased scope. */
  fullScope: ScopeItem[];
  defaultStartDate: CalendarDate;
  split_payment: { enabled: boolean; plans: PaymentPlan[] };
  phased_scope: { enabled: boolean; phase1Scopes: PhaseScopePreset[]; plans: PaymentPlan[] };
  deferred_start: { enabled: boolean; startDates: CalendarDate[]; plans: PaymentPlan[] };
  /** Each approved term carries its own approved payment plans. */
  shorter_commitment: { enabled: boolean; terms: { termMonths: number; plans: PaymentPlan[] }[] };
  /** Discount levels the merchant allows templates to use (bps). Default [0]. */
  discountsBps: number[];
  /** Templates a non-zero discount level applies to. Absent: all of them. */
  discountOn?: TemplateType[];
}

export type TemplateType = "split_payment" | "phased_scope" | "deferred_start" | "shorter_commitment";
export const TEMPLATE_TYPES: TemplateType[] = ["split_payment", "phased_scope", "deferred_start", "shorter_commitment"];

// ── Buyer, messages ──────────────────────────────────────────────────────────

export interface Buyer {
  id: string;
  name: string;
  gstin?: string;
  pastPaymentFacts?: string[];
}

export interface Message {
  id: string;
  dealId: string;
  author: "buyer" | "merchant";
  text: string;
  timestamp: string;
  source: "whatsapp" | "email";
  /** Set when the message replies to something Adaptive Deals sent, e.g. an advance notice. */
  inReplyTo?: string;
}

// ── Constraint profile ───────────────────────────────────────────────────────

export type FieldStatus = "stated" | "ambiguous" | "missing";
export type Confidence = "high" | "medium" | "low";

export interface Evidence {
  quote: string;
  messageId: string;
  /** Character offsets of the quote inside the message, verified by code. */
  start: number;
  end: number;
}

export interface ProfileField<T> {
  key: string;
  label: string;
  rawText: string | null;
  value: T | null;
  unit: string | null;
  evidence: Evidence[];
  transformation: string | null;
  confidence: Confidence;
  status: FieldStatus;
  /** For ambiguous fields: each safe reading code will evaluate. */
  readings?: T[];
  note?: string;
  /** Set when the value was resolved by a merchant-recorded clarification answer. */
  clarification?: ClarificationAnswer;
  /** GST basis only: the stated amounts this value was explicitly confirmed for. */
  covers?: AmountField[];
  /** Required services only: set when the merchant confirmed services the extraction could not map. */
  merchantConfirmation?: { confirmedAt: string; by: string; unmappedPhrases: string[] };
}

/** Amount-bearing profile fields whose GST basis must be confirmed explicitly. */
export type AmountField = "budgetNow" | "approvalLimit";

export type ConfirmationChannel = "whatsapp" | "email" | "call";

export interface ClarificationAnswer {
  clarificationId: string;
  question: string;
  answerText: string;
  recordedBy: string;
  confirmedByBuyerVia: ConfirmationChannel;
  answeredAt: string;
  /** GST answers only: which stated amounts the answer explicitly names. */
  coversAmounts?: AmountField[];
}

export type GstInclusion = "yes" | "no";
export type ApprovalScope = "per_payment" | "per_contract";

export interface BudgetNow {
  amountPaise: Paise;
  period: Period;
}

export interface NextBudget {
  available: DateValue;
  amountPaise: Paise | null;
}

export interface ApprovalLimit {
  amountPaise: Paise;
}

export interface BudgetGap {
  /** First day with no available budget (day after the current period ends). */
  from: CalendarDate;
  /** Budget becomes available again at this date/month. */
  until: DateValue;
  evidence: Evidence[];
  rule: string;
}

export interface OutsideTemplateRequest {
  rawText: string;
  evidence: Evidence[];
  kind: string;
  representable: boolean;
  reason: string;
}

export interface ConstraintProfile {
  dealId: string;
  budgetNow: ProfileField<BudgetNow>;
  nextBudget: ProfileField<NextBudget>;
  approvalLimit: ProfileField<ApprovalLimit>;
  approvalScope: ProfileField<ApprovalScope>;
  amountsIncludeGst: ProfileField<GstInclusion>;
  latestStart: ProfileField<DateValue>;
  requiredPackages: ProfileField<string[]>;
  optionalPackages: ProfileField<string[]>;
  otherConstraints: ProfileField<string>[];
  derivedBudgetGap: BudgetGap | null;
  outsideTemplateRequests: OutsideTemplateRequest[];
  suspectedInstructions: { quote: string; messageId: string }[];
  rejectedFields: { key: string; reason: string; rawText: string | null }[];
}

/** One fully resolved reading of the profile — what the engine evaluates. */
export interface BuyerConstraints {
  budgetNow: BudgetNow | null;
  nextBudget: NextBudget | null;
  approvalLimit: ApprovalLimit | null;
  approvalScope: ApprovalScope | null;
  amountsIncludeGst: GstInclusion | null;
  /** Where the GST basis came from and which amounts it was explicitly confirmed for. */
  gstBasis: { source: string; covers: AmountField[] } | null;
  latestStart: DateValue | null;
  requiredPackages: string[];
  budgetGap: BudgetGap | null;
}
