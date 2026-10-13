/**
 * SYNTHETIC HERO FIXTURE — every name, price, cost, policy value and date below is
 * illustrative, not merchant evidence. See FIXTURE_RATIONALE.md.
 *
 * This file holds INPUTS ONLY. It contains no outcome labels, rejection reasons,
 * feasibility flags or computed figures: those come from the engine.
 */
import { rupees } from "@/domain/money";
import type { RawExtraction } from "@/domain/constraints";
import type { Buyer, ClarificationAnswer, Merchant, Message, ServicePackage, TemplateConfig } from "@/domain/types";

export const SYNTHETIC_LABEL = "Synthetic data";

export const heroMerchant: Merchant = {
  id: "merchant-pinecone",
  name: "Pinecone Media Works",
  segment: "Agency — modular digital-marketing services",
  timeZone: "Asia/Kolkata",
  policy: {
    gstRateBps: 1800,
    contributionFloor: { minPercentBps: 3500, minPaise: null, combine: "both" },
    // One month of this client's average billing (₹1,20,000 / 12). See FIXTURE_RATIONALE.md.
    cashAtRiskLimitPaise: rupees(10_000),
    maxTenureMonths: 12,
    smallestInstalmentPaise: rupees(10_000),
    discountLimitBps: 0,
    paymentFeeBps: 200,
    advanceNoticeDays: 3,
    internalRetryAfterDays: 3,
    mandateEndBufferMonths: 1,
  },
};

export const heroPackages: ServicePackage[] = [
  {
    id: "website-fixes",
    name: "Website fixes",
    kind: "one_time",
    listPricePaise: rupees(24_000),
    directCostPaise: rupees(12_000),
    costTiming: "start_of_delivery_month",
    deferrable: true,
    removable: true,
    hasIndependentValue: true,
  },
  {
    id: "search-marketing",
    name: "Search marketing",
    kind: "monthly",
    listPricePaise: rupees(4_000),
    directCostPaise: rupees(2_000),
    costTiming: "start_of_delivery_month",
    deferrable: true,
    removable: true,
    hasIndependentValue: true,
  },
  {
    id: "social-media",
    name: "Social media",
    kind: "monthly",
    listPricePaise: rupees(3_000),
    directCostPaise: rupees(1_500),
    costTiming: "start_of_delivery_month",
    deferrable: true,
    removable: true,
    hasIndependentValue: true,
  },
  {
    id: "monthly-reporting",
    name: "Monthly reporting",
    kind: "monthly",
    listPricePaise: rupees(1_000),
    directCostPaise: rupees(250),
    costTiming: "start_of_delivery_month",
    deferrable: true,
    removable: true,
    hasIndependentValue: false,
    dependsOnAny: ["search-marketing", "social-media"],
  },
];

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export const heroTemplates: TemplateConfig = {
  fullScope: [
    { packageId: "website-fixes", months: 1 },
    { packageId: "search-marketing", months: 12 },
    { packageId: "social-media", months: 12 },
    { packageId: "monthly-reporting", months: 12 },
  ],
  defaultStartDate: "2026-11-01",
  split_payment: {
    enabled: true,
    plans: [
      { id: "monthly_12", label: "12 monthly payments", offsetsMonths: range(12) },
      { id: "quarterly_4", label: "4 quarterly payments", offsetsMonths: [0, 3, 6, 9] },
      { id: "two_equal", label: "2 equal payments, 6 months apart", offsetsMonths: [0, 6] },
      { id: "deposit_20", label: "20% at start, 80% in month 7", offsetsMonths: [0, 6], weightsBps: [2000, 8000] },
      { id: "deposit_30", label: "30% at start, 70% in month 7", offsetsMonths: [0, 6], weightsBps: [3000, 7000] },
    ],
  },
  phased_scope: {
    enabled: true,
    phase1Scopes: [
      {
        id: "web-search-report-3m",
        label: "Website fixes + 3 months of search marketing and reporting",
        items: [
          { packageId: "website-fixes", months: 1 },
          { packageId: "search-marketing", months: 3 },
          { packageId: "monthly-reporting", months: 3 },
        ],
      },
    ],
    plans: [
      { id: "upfront", label: "single payment at start", offsetsMonths: [0] },
      { id: "two_monthly", label: "2 monthly payments", offsetsMonths: [0, 1] },
      { id: "three_monthly", label: "3 monthly payments", offsetsMonths: [0, 1, 2] },
    ],
  },
  deferred_start: {
    enabled: true,
    startDates: ["2027-01-01", "2027-04-01", "2027-05-01"],
    plans: [{ id: "monthly_12", label: "12 monthly payments", offsetsMonths: range(12) }],
  },
  shorter_commitment: {
    enabled: true,
    terms: [
      {
        termMonths: 3,
        plans: [
          { id: "upfront", label: "single payment at start", offsetsMonths: [0] },
          { id: "monthly", label: "3 monthly payments", offsetsMonths: range(3) },
        ],
      },
      {
        termMonths: 6,
        plans: [
          { id: "upfront", label: "single payment at start", offsetsMonths: [0] },
          { id: "monthly", label: "6 monthly payments", offsetsMonths: range(6) },
        ],
      },
    ],
  },
  discountsBps: [0],
};

export const heroBuyer: Buyer = {
  id: "buyer-kestrel",
  name: "Kestrel Lane Clinics",
  pastPaymentFacts: [],
};

export const HERO_DEAL_ID = "deal-hero";
export const HERO_BUYER_MESSAGE = "Only ₹50K left this quarter; new budget in April; anything above ₹60K needs MD approval.";

export const heroMessages: Message[] = [
  {
    id: "msg-1",
    dealId: HERO_DEAL_ID,
    author: "merchant",
    text: "Sharing our annual proposal: website fixes, search marketing, social media and monthly reporting for ₹1,20,000 + GST. Happy to walk you through it.",
    timestamp: "2026-09-29T16:10:00+05:30",
    source: "whatsapp",
  },
  {
    id: "msg-2",
    dealId: HERO_DEAL_ID,
    author: "buyer",
    text: HERO_BUYER_MESSAGE,
    timestamp: "2026-10-01T08:47:00+05:30",
    source: "whatsapp",
  },
];

/**
 * SYNTHETIC extraction in the shape the AI layer returns. Used by the credential-free
 * synthetic replay and by domain tests. It is not output from a real model run.
 */
export const heroSyntheticExtraction: RawExtraction = {
  fields: [
    { key: "budget_now_amount", rawText: "₹50K", evidenceQuote: "Only ₹50K left this quarter", messageId: "msg-2", confidence: "high" },
    { key: "budget_now_period", rawText: "this quarter", evidenceQuote: "Only ₹50K left this quarter", messageId: "msg-2", confidence: "high" },
    { key: "next_budget_date", rawText: "April", evidenceQuote: "new budget in April", messageId: "msg-2", confidence: "high" },
    { key: "approval_limit_amount", rawText: "₹60K", evidenceQuote: "anything above ₹60K needs MD approval", messageId: "msg-2", confidence: "high" },
  ],
  ambiguities: [
    { fieldKey: "amounts_include_gst", reason: "₹50K and ₹60K are stated without saying whether GST is included" },
    { fieldKey: "approval_limit_scope", reason: "“anything above ₹60K” could mean any single payment or the whole contract" },
  ],
  missingRequired: [],
  outsideTemplates: [],
  suspectedInstructions: [],
};

/** Pinned hero clarification answers, recorded by the merchant and confirmed by the buyer. */
export const heroClarificationAnswers: { gst: ClarificationAnswer & { value: "yes" }; approvalScope: ClarificationAnswer & { value: "per_contract" } } = {
  gst: {
    clarificationId: "clar-gst",
    question: "Do both ₹50,000 and ₹60,000 include GST?",
    answerText: "Yes, both amounts include GST.",
    recordedBy: "Merchant (Pinecone Media Works)",
    confirmedByBuyerVia: "whatsapp",
    answeredAt: "2026-10-01T09:20:00+05:30",
    coversAmounts: ["budgetNow", "approvalLimit"],
    value: "yes",
  },
  approvalScope: {
    clarificationId: "clar-approval",
    question: "Is ₹60,000 the limit per payment or for the full contract?",
    answerText: "₹60,000 is per contract.",
    recordedBy: "Merchant (Pinecone Media Works)",
    confirmedByBuyerVia: "whatsapp",
    answeredAt: "2026-10-01T09:22:00+05:30",
    value: "per_contract",
  },
};

/**
 * Pre-scripted simulated buyer replies, selected by the demo operator. Clarification scripts
 * carry the answer value as script metadata (no interpretation); every other reply goes through
 * code's bounded reply classification, exactly like a typed reply.
 */
export const heroScriptedReplies = [
  { id: "clar-gst-yes", context: "clarification" as const, questionId: "clar-gst", text: "Yes, both amounts include GST.", answerValue: "yes" },
  { id: "clar-gst-no", context: "clarification" as const, questionId: "clar-gst", text: "No, both amounts exclude GST.", answerValue: "no" },
  { id: "clar-gst-unclear", context: "clarification" as const, questionId: "clar-gst", text: "₹50,000 includes GST, but I'm not sure about the ₹60,000 limit." },
  { id: "clar-approval-contract", context: "clarification" as const, questionId: "clar-approval", text: "₹60,000 is per contract.", answerValue: "per_contract" },
  { id: "clar-approval-payment", context: "clarification" as const, questionId: "clar-approval", text: "₹60,000 is per payment.", answerValue: "per_payment" },
  { id: "clar-approval-unclear", context: "clarification" as const, questionId: "clar-approval", text: "I'm not sure whether ₹60,000 is per payment or for the full contract." },
  { id: "notice-cash-tight", context: "notice" as const, text: "Cash is tight till the 20th.", hero: true },
  { id: "notice-paid", context: "notice" as const, text: "I paid" },
  { id: "notice-okay", context: "notice" as const, text: "Okay" },
  { id: "notice-amount", context: "notice" as const, text: "Can we do up to ₹10K this month?" },
  { id: "notice-tak", context: "notice" as const, text: "20 tak paisa nahi hai" },
  { id: "notice-next-week", context: "notice" as const, text: "Cash tight till next week" },
  { id: "proposal-okay", context: "proposal" as const, text: "Okay" },
  // The buyer's decision when the pilot ends. The decision rides on the script as metadata, exactly like a clarification's answer value; nothing is interpreted.
  { id: "review-proceed", context: "review" as const, text: "Kabir: The pilot went well and enquiries are up. Let's go ahead with the rest of the year.", reviewDecision: "proceed" as const },
  { id: "review-changes", context: "review" as const, text: "Kabir: We want to continue, but could the rest of the year leave out social media for now? That keeps us under our ₹60,000 limit.", reviewDecision: "changes" as const, reviewChange: { removePackageId: "social-media" } },
  { id: "review-stop", context: "review" as const, text: "Kabir: Thanks, the pilot was useful, but we'd like to stop here.", reviewDecision: "stop" as const },
];

/** Staged later events. Each one is a simulated demo action with an explicit simulated date. */
export const heroDemoEvents = {
  upfrontPaidAt: "2026-11-01T10:00:00+05:30",
  advanceNoticeAt: "2026-11-28T10:00:00+05:30",
  failedDebitAt: "2026-12-01T10:00:00+05:30",
  /** Preventive path (hero): the buyer answers the 28 Nov notice the same afternoon. */
  preventiveReplyAt: "2026-11-28T12:30:00+05:30",
  /** Secondary path: reply after a failed debit. */
  buyerReply: {
    id: "msg-3",
    text: "Sorry, cash tight till the 20th. Can you take it after that?",
    timestamp: "2026-12-01T11:05:00+05:30",
    source: "whatsapp" as const,
    evidenceQuote: "cash tight till the 20th",
    rawDate: "till the 20th",
  },
};
