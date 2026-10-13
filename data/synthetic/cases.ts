/**
 * Designed commercial cases for the product demo. Every party, message and constraint is
 * fictional. These inputs are development scenarios, not merchant research or model results.
 */
import type { DealContext } from "@/ai/orchestrator";
import type { RecordedAnswer } from "@/ai/run-record";
import type { ExtractionOutput } from "@/ai/schemas";
import type { DealTerms } from "@/lib/deal-economics";
import { heroMerchant, heroPackages, heroTemplates } from "./hero";
import { zephyrMerchant, zephyrTemplates, zephyrTerms } from "./zephyr";

export const CASE_IDS = ["reduced-scope", "preserve-scope", "no-fit"] as const;
export type CaseId = (typeof CASE_IDS)[number];
export const DEFAULT_CASE_ID: CaseId = "reduced-scope";

export interface DemoCase {
  id: CaseId;
  title: string;
  buyer: { id: string; name: string };
  proposalSummary: string;
  barrier: string;
  proofPoint: string;
  provenance: "Synthetic scenario";
  bundledRunPath: string;
  deal: DealContext;
  quote: { prePaise: number };
  /** The simulated buyer's replies in this case's own voices. Only the words change: the meaning each reply carries (its answer value) does not. */
  replyScripts?: Partial<Record<string, string>>;
  /** Simulated replies that would take the deal away from what its conversation says. They are not offered in the guide for this case. */
  hiddenReplies?: readonly string[];
  /** The words of an answer as it is recorded, when the case's amounts are not the generic script's. The reply must contain them. */
  answerQuotes?: Partial<Record<string, string>>;
  /** The last part of this case's story, which the walkthrough counts as a step: the month-three review, or a payment moved before it is late. */
  journeyEnd?: "month_three_review" | "preventive_restructure";
  /** What the merchant agreed for this buyer on top of the account's own terms: a discount limit and ways to pay. Absent: the account alone. */
  terms?: DealTerms;
  expected: {
    extraction: ExtractionOutput;
    engineState: "options_ready" | "no_feasible_deal";
    recommendedTemplate: "phased_scope" | "deferred_start" | null;
    recordedAnswers: RecordedAnswer[];
  };
}

const sharedDeal = (dealId: string, messages: DealContext["messages"]): DealContext => ({
  dealId,
  messages,
  merchant: heroMerchant,
  packages: heroPackages,
  templates: heroTemplates,
});

/** Case B: the same merchant and services, with the terms agreed for this buyer. */
const zephyrDeal = (dealId: string, messages: DealContext["messages"]): DealContext => ({
  dealId,
  messages,
  merchant: zephyrMerchant,
  packages: heroPackages,
  templates: zephyrTemplates,
});

const reducedExtraction: ExtractionOutput = {
  fields: [
    { key: "budget_now_amount", raw_text: "₹50,000", evidence_quote: "I only have ₹50,000 left in this quarter", message_id: "reduced-4", confidence: "high" },
    { key: "budget_now_period", raw_text: "this quarter", evidence_quote: "I only have ₹50,000 left in this quarter", message_id: "reduced-4", confidence: "high" },
    { key: "next_budget_date", raw_text: "January", evidence_quote: "Our fresh budget opens in January", message_id: "reduced-4", confidence: "high" },
    { key: "approval_limit_amount", raw_text: "₹60,000", evidence_quote: "Anything above ₹60,000 has to go to our MD", message_id: "reduced-5", confidence: "high" },
    { key: "required_package", raw_text: "website fixes", evidence_quote: "we need the website fixes and search marketing", message_id: "reduced-3", confidence: "high" },
    { key: "required_package", raw_text: "search marketing", evidence_quote: "we need the website fixes and search marketing", message_id: "reduced-3", confidence: "high" },
    { key: "optional_package", raw_text: "Social media", evidence_quote: "Social media can wait", message_id: "reduced-3", confidence: "high" },
    { key: "other_constraint", raw_text: "enquiries are up by about 20 a month by month three", evidence_quote: "If enquiries are up by about 20 a month by month three, we'll go ahead with the rest of the year", message_id: "reduced-7", confidence: "high" },
  ],
  ambiguities: [
    { field_key: "amounts_include_gst", reason: "The buyer did not confirm whether both stated amounts include GST" },
    { field_key: "approval_limit_scope", reason: "The buyer did not confirm whether the limit applies per payment or per contract" },
  ],
  missing_required: [],
  unsupported_requests: [],
  suspected_instructions: [],
};

const discountExtraction: ExtractionOutput = {
  fields: [
    { key: "budget_now_amount", raw_text: "₹30,000", evidence_quote: "I only have ₹30,000 left in this quarter", message_id: "discount-8", confidence: "high" },
    { key: "budget_now_period", raw_text: "this quarter", evidence_quote: "I only have ₹30,000 left in this quarter", message_id: "discount-8", confidence: "high" },
    { key: "next_budget_date", raw_text: "1 January", evidence_quote: "Our fresh budget opens on 1 January", message_id: "discount-8", confidence: "high" },
    { key: "approval_limit_amount", raw_text: "₹75,000", evidence_quote: "Our ops head can approve up to ₹75,000", message_id: "discount-4", confidence: "high" },
    { key: "required_package", raw_text: "website fixes", evidence_quote: "We mostly need the website fixes and search marketing", message_id: "discount-6", confidence: "high" },
    { key: "required_package", raw_text: "search marketing", evidence_quote: "We mostly need the website fixes and search marketing", message_id: "discount-6", confidence: "high" },
    { key: "optional_package", raw_text: "Monthly reporting", evidence_quote: "Monthly reporting is nice to have, but it can wait", message_id: "discount-6", confidence: "high" },
    { key: "other_constraint", raw_text: "payment terms are net-45 from the invoice", evidence_quote: "Our standard payment terms are net-45 from the invoice", message_id: "discount-5", confidence: "high" },
  ],
  ambiguities: [
    { field_key: "amounts_include_gst", reason: "The buyer did not confirm whether the stated amounts include GST" },
    { field_key: "approval_limit_scope", reason: "The buyer did not confirm whether the limit applies per payment or per contract" },
  ],
  missing_required: [],
  unsupported_requests: [
    { raw_text: "15% off any retainer above ₹75,000", evidence_quote: "Our vendor policy expects 15% off any retainer above ₹75,000", message_id: "discount-2", kind: "discount" },
  ],
  suspected_instructions: [],
};

const discountAnswers: RecordedAnswer[] = [
  {
    questionId: "clar-gst",
    value: "yes",
    answerText: "Yes, both amounts include GST.",
    recordedBy: "Merchant (Pinecone Media Works)",
    confirmedByBuyerVia: "whatsapp",
    answeredAt: "2026-10-01T09:10:00+05:30",
  },
];

const noFitExtraction: ExtractionOutput = {
  fields: [
    { key: "budget_now_amount", raw_text: "₹2,00,000", evidence_quote: "₹2,00,000 available this quarter, including GST", message_id: "no-fit-4", confidence: "high" },
    { key: "budget_now_period", raw_text: "this quarter", evidence_quote: "₹2,00,000 available this quarter, including GST", message_id: "no-fit-4", confidence: "high" },
    { key: "amounts_include_gst", raw_text: "including GST", evidence_quote: "₹2,00,000 available this quarter, including GST", message_id: "no-fit-4", confidence: "high" },
    { key: "latest_start", raw_text: "15 October", evidence_quote: "start no later than 15 October", message_id: "no-fit-2", confidence: "high" },
    { key: "required_package", raw_text: "website fixes", evidence_quote: "website fixes, search, social and monthly reporting", message_id: "no-fit-3", confidence: "high" },
    { key: "required_package", raw_text: "search", evidence_quote: "website fixes, search, social and monthly reporting", message_id: "no-fit-3", confidence: "high" },
    { key: "required_package", raw_text: "social", evidence_quote: "website fixes, search, social and monthly reporting", message_id: "no-fit-3", confidence: "high" },
    { key: "required_package", raw_text: "monthly reporting", evidence_quote: "website fixes, search, social and monthly reporting", message_id: "no-fit-3", confidence: "high" },
  ],
  ambiguities: [],
  missing_required: [],
  unsupported_requests: [],
  suspected_instructions: [],
};

const reducedAnswers: RecordedAnswer[] = [
  {
    questionId: "clar-gst",
    value: "yes",
    answerText: "Yes, both amounts include GST.",
    recordedBy: "Merchant (Pinecone Media Works)",
    confirmedByBuyerVia: "whatsapp",
    answeredAt: "2026-10-01T09:20:00+05:30",
  },
  {
    questionId: "clar-approval",
    value: "per_contract",
    answerText: "₹60,000 is per contract.",
    recordedBy: "Merchant (Pinecone Media Works)",
    confirmedByBuyerVia: "whatsapp",
    answeredAt: "2026-10-01T09:22:00+05:30",
  },
];

const catalog: Record<CaseId, DemoCase> = {
  "reduced-scope": {
    id: "reduced-scope",
    title: "They want to start small and see results first",
    buyer: { id: "buyer-harbour-fresh", name: "Harbour Fresh Foods" },
    proposalSummary: "Annual plan: website, search, social and reporting · ₹1,20,000 + GST",
    barrier: "They would rather prove it first. They can commit ₹50,000 this quarter, anything above ₹60,000 goes to their MD, and fresh budget opens in January.",
    proofPoint: "Shows a pilot-first deal: a smaller phase that fits the buyer's limit and starts now, with the rest of the year decided after the review. The merchant keeps the final choice.",
    provenance: "Synthetic scenario",
    bundledRunPath: "data/synthetic/replay/reduced-scope-synthetic-run.json",
    quote: { prePaise: 12_000_000 },
    replyScripts: {
      "clar-gst-yes": "Divya: Yes, both amounts include GST. Finance confirmed it this morning.",
      "clar-gst-no": "Divya: No, both amounts exclude GST. Those are the pre-GST figures.",
      "clar-gst-unclear": "Divya: The ₹50,000 includes GST, but I'm not sure about the ₹60,000 limit. Let me check.",
      "clar-approval-contract": "Kabir: ₹60,000 is per contract. Above that, our MD signs.",
      "clar-approval-payment": "Kabir: ₹60,000 is per payment. Anything bigger needs our MD each time.",
      "clar-approval-unclear": "Kabir: I'm not sure yet whether the ₹60,000 is per payment or for the whole contract.",
    },
    deal: sharedDeal("case-reduced-scope", [
      {
        id: "reduced-1",
        dealId: "case-reduced-scope",
        author: "merchant",
        text: "Hi Kabir, Divya, good speaking on Monday. Sharing the annual plan we discussed: website fixes, search marketing, social media and monthly reporting. It comes to ₹1,20,000 plus GST for the year.",
        timestamp: "2026-09-29T16:10:00+05:30",
        source: "whatsapp",
      },
      {
        id: "reduced-2",
        dealId: "case-reduced-scope",
        author: "buyer",
        text: "Kabir: Thanks Meera. Honestly, I would rather start small and see results before we commit to a full year.",
        timestamp: "2026-10-01T08:47:00+05:30",
        source: "whatsapp",
      },
      {
        id: "reduced-3",
        dealId: "case-reduced-scope",
        author: "buyer",
        text: "Divya: For now, we need the website fixes and search marketing. Social media can wait.",
        timestamp: "2026-10-01T08:48:00+05:30",
        source: "whatsapp",
      },
      {
        id: "reduced-4",
        dealId: "case-reduced-scope",
        author: "buyer",
        text: "Kabir: I only have ₹50,000 left in this quarter. Our fresh budget opens in January.",
        timestamp: "2026-10-01T08:49:00+05:30",
        source: "whatsapp",
      },
      {
        id: "reduced-5",
        dealId: "case-reduced-scope",
        author: "buyer",
        text: "Kabir: Anything above ₹60,000 has to go to our MD. If a smaller website-and-search phase fits within the limit, I can move it ahead.",
        timestamp: "2026-10-01T08:50:00+05:30",
        source: "whatsapp",
      },
      {
        id: "reduced-6",
        dealId: "case-reduced-scope",
        author: "merchant",
        text: "That works. Phase one could be the website fixes plus three months of search and reporting. If it goes well, I will hold today's monthly rates for the rest of the year, provided you confirm within 45 days of the month-three review.",
        timestamp: "2026-10-01T09:05:00+05:30",
        source: "whatsapp",
      },
      {
        id: "reduced-7",
        dealId: "case-reduced-scope",
        author: "buyer",
        text: "Kabir: Fair. If enquiries are up by about 20 a month by month three, we'll go ahead with the rest of the year.",
        timestamp: "2026-10-01T09:10:00+05:30",
        source: "whatsapp",
      },
      {
        id: "reduced-8",
        dealId: "case-reduced-scope",
        author: "buyer",
        text: "Divya: Sounds good. Send the offer across when it is ready.",
        timestamp: "2026-10-01T09:12:00+05:30",
        source: "whatsapp",
      },
    ]),
    expected: { extraction: reducedExtraction, engineState: "options_ready", recommendedTemplate: "phased_scope", recordedAnswers: reducedAnswers },
  },
  "preserve-scope": {
    id: "preserve-scope",
    title: "They want 15% off and 45-day terms",
    buyer: { id: "buyer-zephyr", name: "Zephyr Logistics" },
    proposalSummary: "Six-month retainer: website, search, social and reporting · ₹72,000 + GST",
    barrier: "Their vendor policy expects 15% off and net-45. Their ops head approves up to ₹75,000, and they can pay ₹30,000 now and the rest in January.",
    proofPoint: "Shows a discount given only in exchange for something: the engine refuses the 15% and the net-45 terms by name, and the one offer that works is a smaller discount against part of the payment on signing.",
    provenance: "Synthetic scenario",
    bundledRunPath: "data/synthetic/replay/preserve-scope-synthetic-run.json",
    quote: { prePaise: 7_200_000 },
    terms: zephyrTerms,
    journeyEnd: "preventive_restructure",
    hiddenReplies: ["clar-gst-no"],
    replyScripts: {
      "clar-gst-yes": "Priya: Yes, both amounts include GST. We budget everything with GST.",
      "clar-gst-unclear": "Priya: The ₹30,000 includes GST, but I'm not sure about the ₹75,000 limit. Let me check.",
      "notice-cash-tight": "Priya: Invoice approval is delayed. Please hold the payment till the 12th.",
    },
    deal: zephyrDeal("case-preserve-scope", [
      {
        id: "discount-1",
        dealId: "case-preserve-scope",
        author: "merchant",
        text: 'Hi Aarav, Priya, here is the six-month retainer we discussed: website fixes, search marketing, social media and monthly reporting. It comes to ₹72,000 plus GST.',
        timestamp: "2026-09-28T15:40:00+05:30",
        source: "whatsapp",
      },
      {
        id: "discount-2",
        dealId: "case-preserve-scope",
        author: "buyer",
        text: 'Aarav: Thanks Meera. Our vendor policy expects 15% off any retainer above ₹75,000.',
        timestamp: "2026-10-01T08:40:00+05:30",
        source: "whatsapp",
      },
      {
        id: "discount-3",
        dealId: "case-preserve-scope",
        author: "merchant",
        text: "We don't usually discount, but I'm open to talking it through. What does approval look like on your side?",
        timestamp: "2026-10-01T08:44:00+05:30",
        source: "whatsapp",
      },
      {
        id: "discount-4",
        dealId: "case-preserve-scope",
        author: "buyer",
        text: 'Aarav: Our ops head can approve up to ₹75,000. Anything above that goes to our MD, and that takes about three weeks.',
        timestamp: "2026-10-01T08:46:00+05:30",
        source: "whatsapp",
      },
      {
        id: "discount-5",
        dealId: "case-preserve-scope",
        author: "buyer",
        text: 'Aarav: Our standard payment terms are net-45 from the invoice.',
        timestamp: "2026-10-01T08:47:00+05:30",
        source: "whatsapp",
      },
      {
        id: "discount-6",
        dealId: "case-preserve-scope",
        author: "buyer",
        text: 'Aarav: We mostly need the website fixes and search marketing. Monthly reporting is nice to have, but it can wait.',
        timestamp: "2026-10-01T08:48:00+05:30",
        source: "whatsapp",
      },
      {
        id: "discount-7",
        dealId: "case-preserve-scope",
        author: "merchant",
        text: 'Net-45 is hard for us, we pay our contractors at the start of every month. I can only look at a discount if you give something in return, like part of the payment on signing.',
        timestamp: "2026-10-01T08:52:00+05:30",
        source: "whatsapp",
      },
      {
        id: "discount-8",
        dealId: "case-preserve-scope",
        author: "buyer",
        text: 'Priya: I only have ₹30,000 left in this quarter. Our fresh budget opens on 1 January.',
        timestamp: "2026-10-01T08:56:00+05:30",
        source: "whatsapp",
      },
      {
        id: "discount-9",
        dealId: "case-preserve-scope",
        author: "buyer",
        text: 'Priya: If the total comes to ₹75,000 or less, we can pay ₹30,000 on signing and the balance in January. We would also look at a longer term if the rate is better.',
        timestamp: "2026-10-01T08:57:00+05:30",
        source: "whatsapp",
      },
      {
        id: "discount-10",
        dealId: "case-preserve-scope",
        author: "buyer",
        text: 'Aarav: Sounds good. Send one clear offer when it is ready.',
        timestamp: "2026-10-01T09:02:00+05:30",
        source: "whatsapp",
      },
    ]),
    expected: { extraction: discountExtraction, engineState: "options_ready", recommendedTemplate: "phased_scope", recordedAnswers: discountAnswers },
  },
  "no-fit": {
    id: "no-fit",
    title: "They want to start in two weeks",
    buyer: { id: "buyer-blueharbor", name: "Blue Harbor Foods" },
    proposalSummary: "Launch support · ₹1,20,000 + GST",
    barrier: "Their launch date can't move, and you can't start that soon.",
    proofPoint: "Shows a clean extraction followed by justified abstention: every merchant-approved structure breaks a buyer constraint, so the engine rejects them all.",
    provenance: "Synthetic scenario",
    bundledRunPath: "data/synthetic/replay/no-fit-synthetic-run.json",
    quote: { prePaise: 12_000_000 },
    deal: sharedDeal("case-no-fit", [
      {
        id: "no-fit-1",
        dealId: "case-no-fit",
        author: "merchant",
        text: "Hi, sharing the launch proposal. It is ₹1,20,000 plus GST for website fixes, search marketing, social media and monthly reporting. We currently have delivery starting in November.",
        timestamp: "2026-09-29T16:30:00+05:30",
        source: "whatsapp",
      },
      {
        id: "no-fit-2",
        dealId: "case-no-fit",
        author: "buyer",
        text: "The issue is timing. We need your team to start no later than 15 October.",
        timestamp: "2026-10-01T08:55:00+05:30",
        source: "whatsapp",
      },
      {
        id: "no-fit-3",
        dealId: "case-no-fit",
        author: "buyer",
        text: "We need the full scope: website fixes, search, social and monthly reporting.",
        timestamp: "2026-10-01T08:56:00+05:30",
        source: "whatsapp",
      },
      {
        id: "no-fit-4",
        dealId: "case-no-fit",
        author: "buyer",
        text: "Budget isn’t the issue. We have ₹2,00,000 available this quarter, including GST.",
        timestamp: "2026-10-01T08:57:00+05:30",
        source: "whatsapp",
      },
      {
        id: "no-fit-5",
        dealId: "case-no-fit",
        author: "buyer",
        text: "We can’t move the date or reduce the scope. If you can’t start by then, please tell us clearly.",
        timestamp: "2026-10-01T08:58:00+05:30",
        source: "whatsapp",
      },
    ]),
    expected: { extraction: noFitExtraction, engineState: "no_feasible_deal", recommendedTemplate: null, recordedAnswers: [] },
  },
};

export function demoCase(id: string): DemoCase | null {
  return id in catalog ? structuredClone(catalog[id as CaseId]) : null;
}

export function allDemoCases(): DemoCase[] {
  return CASE_IDS.map((id) => demoCase(id)!);
}

/** What the simulated buyer says for a scripted reply in this case: the case's own words when it has them, otherwise the shared script. */
/** The words recorded as the answer a scripted reply gives: the case's own, else the script's. */
export function scriptedAnswerQuote(caseId: string, script: { id: string; text: string }): string {
  return catalog[caseId as CaseId]?.answerQuotes?.[script.id] ?? script.text;
}

export function scriptedReplyText(caseId: string, script: { id: string; text: string }): string {
  return catalog[caseId as CaseId]?.replyScripts?.[script.id] ?? script.text;
}
