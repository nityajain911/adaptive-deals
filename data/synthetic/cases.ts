/**
 * Designed commercial cases for the product demo. Every party, message and constraint is
 * fictional. These inputs are development scenarios, not merchant research or model results.
 */
import type { DealContext } from "@/ai/orchestrator";
import type { RecordedAnswer } from "@/ai/run-record";
import type { ExtractionOutput } from "@/ai/schemas";
import { heroMerchant, heroPackages, heroTemplates } from "./hero";

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

const reducedExtraction: ExtractionOutput = {
  fields: [
    { key: "budget_now_amount", raw_text: "₹50,000", evidence_quote: "We have ₹50,000 left this quarter", message_id: "reduced-2", confidence: "high" },
    { key: "budget_now_period", raw_text: "this quarter", evidence_quote: "We have ₹50,000 left this quarter", message_id: "reduced-2", confidence: "high" },
    { key: "next_budget_date", raw_text: "April", evidence_quote: "new budget opens in April", message_id: "reduced-2", confidence: "high" },
    { key: "approval_limit_amount", raw_text: "₹60,000", evidence_quote: "our ₹60,000 MD approval limit", message_id: "reduced-2", confidence: "high" },
    { key: "required_package", raw_text: "Website fixes", evidence_quote: "Website fixes and Search marketing are the pieces we need now", message_id: "reduced-2", confidence: "high" },
    { key: "required_package", raw_text: "Search marketing", evidence_quote: "Website fixes and Search marketing are the pieces we need now", message_id: "reduced-2", confidence: "high" },
    { key: "optional_package", raw_text: "Social media", evidence_quote: "Social media can wait", message_id: "reduced-2", confidence: "high" },
  ],
  ambiguities: [
    { field_key: "amounts_include_gst", reason: "The buyer did not confirm whether both stated amounts include GST" },
    { field_key: "approval_limit_scope", reason: "The buyer did not confirm whether the limit applies per payment or per contract" },
  ],
  missing_required: [],
  unsupported_requests: [],
  suspected_instructions: [],
};

const preserveExtraction: ExtractionOutput = {
  fields: [
    { key: "budget_now_amount", raw_text: "₹10,000", evidence_quote: "We have ₹10,000 available this quarter", message_id: "preserve-2", confidence: "high" },
    { key: "budget_now_period", raw_text: "this quarter", evidence_quote: "We have ₹10,000 available this quarter", message_id: "preserve-2", confidence: "high" },
    { key: "next_budget_date", raw_text: "1st May 2027", evidence_quote: "next campaign budget opens on 1st May 2027", message_id: "preserve-2", confidence: "high" },
    { key: "approval_limit_amount", raw_text: "₹15,000", evidence_quote: "₹15,000 approval limit per payment", message_id: "preserve-2", confidence: "high" },
    { key: "approval_limit_scope", raw_text: "per payment", evidence_quote: "₹15,000 approval limit per payment", message_id: "preserve-2", confidence: "high" },
    {
      key: "amounts_include_gst",
      raw_text: "₹10,000 budget and ₹15,000 approval limit per payment both exclude GST",
      evidence_quote: "The ₹10,000 budget and ₹15,000 approval limit per payment both exclude GST",
      message_id: "preserve-2",
      confidence: "high",
    },
    { key: "required_package", raw_text: "Website fixes", evidence_quote: "Website fixes, Search marketing, Social media and Monthly reporting", message_id: "preserve-2", confidence: "high" },
    { key: "required_package", raw_text: "Search marketing", evidence_quote: "Website fixes, Search marketing, Social media and Monthly reporting", message_id: "preserve-2", confidence: "high" },
    { key: "required_package", raw_text: "Social media", evidence_quote: "Website fixes, Search marketing, Social media and Monthly reporting", message_id: "preserve-2", confidence: "high" },
    { key: "required_package", raw_text: "Monthly reporting", evidence_quote: "Website fixes, Search marketing, Social media and Monthly reporting", message_id: "preserve-2", confidence: "high" },
  ],
  ambiguities: [],
  missing_required: [],
  unsupported_requests: [],
  suspected_instructions: [],
};

const noFitExtraction: ExtractionOutput = {
  fields: [
    { key: "budget_now_amount", raw_text: "₹2,00,000", evidence_quote: "₹2,00,000 available this quarter, including GST", message_id: "no-fit-2", confidence: "high" },
    { key: "budget_now_period", raw_text: "this quarter", evidence_quote: "₹2,00,000 available this quarter, including GST", message_id: "no-fit-2", confidence: "high" },
    { key: "amounts_include_gst", raw_text: "₹2,00,000 available this quarter, including GST", evidence_quote: "₹2,00,000 available this quarter, including GST", message_id: "no-fit-2", confidence: "high" },
    { key: "latest_start", raw_text: "by the 15th", evidence_quote: "work must start by the 15th this month", message_id: "no-fit-2", confidence: "high" },
    { key: "required_package", raw_text: "Website fixes", evidence_quote: "Website fixes, Search marketing, Social media and Monthly reporting", message_id: "no-fit-2", confidence: "high" },
    { key: "required_package", raw_text: "Search marketing", evidence_quote: "Website fixes, Search marketing, Social media and Monthly reporting", message_id: "no-fit-2", confidence: "high" },
    { key: "required_package", raw_text: "Social media", evidence_quote: "Website fixes, Search marketing, Social media and Monthly reporting", message_id: "no-fit-2", confidence: "high" },
    { key: "required_package", raw_text: "Monthly reporting", evidence_quote: "Website fixes, Search marketing, Social media and Monthly reporting", message_id: "no-fit-2", confidence: "high" },
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
    title: "Repair bookings now, defer social",
    buyer: { id: "buyer-kestrel", name: "Kestrel Lane Clinics" },
    proposalSummary: "Annual website, search, social and reporting proposal · ₹1,20,000 before GST",
    barrier: "The buyer can fund the urgent website and search work now, while social can wait.",
    proofPoint: "Shows the engine building a smaller standalone phase without discounting the work, with more than one way to pay for it. The merchant keeps the final choice.",
    provenance: "Synthetic scenario",
    bundledRunPath: "data/synthetic/replay/reduced-scope-synthetic-run.json",
    deal: sharedDeal("case-reduced-scope", [
      {
        id: "reduced-1",
        dealId: "case-reduced-scope",
        author: "merchant",
        text: "Following our call, our annual proposal is Website fixes, Search marketing, Social media and Monthly reporting for ₹1,20,000 plus GST. The aim is to repair the booking journey and then build a steady enquiry pipeline.",
        timestamp: "2026-09-29T16:10:00+05:30",
        source: "whatsapp",
      },
      {
        id: "reduced-2",
        dealId: "case-reduced-scope",
        author: "buyer",
        text: "The broken booking page is costing us enquiries, so Website fixes and Search marketing are the pieces we need now. Social media can wait. We have ₹50,000 left this quarter and new budget opens in April. I have not confirmed whether that amount or our ₹60,000 MD approval limit includes GST, and I need to check whether the limit is per payment or for the whole contract. A smaller website-and-search phase would still solve the immediate problem, and I can buy that phase if it fits the confirmed limit.",
        timestamp: "2026-10-01T08:47:00+05:30",
        source: "whatsapp",
      },
    ]),
    expected: { extraction: reducedExtraction, engineState: "options_ready", recommendedTemplate: "phased_scope", recordedAnswers: reducedAnswers },
  },
  "preserve-scope": {
    id: "preserve-scope",
    title: "Keep the annual scope, move the start",
    buyer: { id: "buyer-northstar", name: "Northstar Learning Centres" },
    proposalSummary: "Full annual launch programme · ₹1,20,000 before GST",
    barrier: "The buyer needs every service, but the next usable campaign budget opens in May.",
    proofPoint: "Shows the engine preserving full scope by changing timing instead of cutting deliverables. When the extraction cannot map the buyer's required scope to specific services, the merchant confirms them before any offer.",
    provenance: "Synthetic scenario",
    bundledRunPath: "data/synthetic/replay/preserve-scope-synthetic-run.json",
    deal: sharedDeal("case-preserve-scope", [
      {
        id: "preserve-1",
        dealId: "case-preserve-scope",
        author: "merchant",
        text: "Our ₹1,20,000 plus GST annual proposal covers Website fixes, Search marketing, Social media and Monthly reporting for the full admissions cycle.",
        timestamp: "2026-09-29T16:20:00+05:30",
        source: "whatsapp",
      },
      {
        id: "preserve-2",
        dealId: "case-preserve-scope",
        author: "buyer",
        text: "We need the complete annual package—Website fixes, Search marketing, Social media and Monthly reporting—for the admissions launch, so please do not reduce the scope. We have ₹10,000 available this quarter. The ₹10,000 budget and ₹15,000 approval limit per payment both exclude GST. Our next campaign budget opens on 1st May 2027. Timing is flexible if the full annual programme remains intact.",
        timestamp: "2026-10-01T08:50:00+05:30",
        source: "whatsapp",
      },
    ]),
    expected: { extraction: preserveExtraction, engineState: "options_ready", recommendedTemplate: "deferred_start", recordedAnswers: [] },
  },
  "no-fit": {
    id: "no-fit",
    title: "Decline an impossible start date",
    buyer: { id: "buyer-blueharbor", name: "Blue Harbor Foods" },
    proposalSummary: "Full launch support · ₹1,20,000 before GST",
    barrier: "The buyer's fixed launch requires work to start before any approved template can begin.",
    proofPoint: "Shows a clean extraction followed by justified abstention: every merchant-approved structure breaks a buyer constraint, so the engine rejects them all.",
    provenance: "Synthetic scenario",
    bundledRunPath: "data/synthetic/replay/no-fit-synthetic-run.json",
    deal: sharedDeal("case-no-fit", [
      {
        id: "no-fit-1",
        dealId: "case-no-fit",
        author: "merchant",
        text: "Our launch proposal is Website fixes, Search marketing, Social media and Monthly reporting for ₹1,20,000 plus GST, with delivery starting in November.",
        timestamp: "2026-09-29T16:30:00+05:30",
        source: "whatsapp",
      },
      {
        id: "no-fit-2",
        dealId: "case-no-fit",
        author: "buyer",
        text: "The retail launch cannot move: work must start by the 15th this month. We have ₹2,00,000 available this quarter, including GST, and need Website fixes, Search marketing, Social media and Monthly reporting. If no approved structure can meet that date, tell us plainly rather than changing the scope or timing.",
        timestamp: "2026-10-01T08:55:00+05:30",
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
