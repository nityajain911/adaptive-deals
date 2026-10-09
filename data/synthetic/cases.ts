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
  quote: { prePaise: number };
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
    { key: "budget_now_amount", raw_text: "₹50,000", evidence_quote: "I only have ₹50,000 left in this quarter", message_id: "reduced-4", confidence: "high" },
    { key: "budget_now_period", raw_text: "this quarter", evidence_quote: "I only have ₹50,000 left in this quarter", message_id: "reduced-4", confidence: "high" },
    { key: "next_budget_date", raw_text: "April", evidence_quote: "Our fresh budget opens in April", message_id: "reduced-4", confidence: "high" },
    { key: "approval_limit_amount", raw_text: "₹60,000", evidence_quote: "Anything above ₹60,000 has to go to our MD", message_id: "reduced-5", confidence: "high" },
    { key: "required_package", raw_text: "website fixes", evidence_quote: "we need the website fixes and search marketing", message_id: "reduced-3", confidence: "high" },
    { key: "required_package", raw_text: "search marketing", evidence_quote: "we need the website fixes and search marketing", message_id: "reduced-3", confidence: "high" },
    { key: "optional_package", raw_text: "Social media", evidence_quote: "Social media can wait", message_id: "reduced-3", confidence: "high" },
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
    { key: "budget_now_amount", raw_text: "₹10,000", evidence_quote: "I can release only ₹10,000 right now", message_id: "preserve-3", confidence: "high" },
    { key: "budget_now_period", raw_text: "This quarter", evidence_quote: "This quarter is tight", message_id: "preserve-3", confidence: "high" },
    { key: "approval_limit_amount", raw_text: "₹15,000", evidence_quote: "approve up to ₹15,000 per payment", message_id: "preserve-5", confidence: "high" },
    { key: "approval_limit_scope", raw_text: "per payment", evidence_quote: "approve up to ₹15,000 per payment", message_id: "preserve-5", confidence: "high" },
    { key: "amounts_include_gst", raw_text: "before GST", evidence_quote: "Both the ₹10,000 and ₹15,000 figures are before GST", message_id: "preserve-5", confidence: "high" },
    { key: "next_budget_date", raw_text: "1 May", evidence_quote: "Our next campaign budget opens on 1 May", message_id: "preserve-4", confidence: "high" },
    // The buyer names the whole package without naming each service: the merchant confirms which services it means before any offer.
    { key: "required_package", raw_text: "complete annual package", evidence_quote: "We need the complete annual package for the admissions season", message_id: "preserve-2", confidence: "high" },
    { key: "other_constraint", raw_text: "please don’t remove anything", evidence_quote: "please don’t remove anything", message_id: "preserve-2", confidence: "high" },
  ],
  ambiguities: [],
  missing_required: [],
  unsupported_requests: [],
  suspected_instructions: [],
};

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
    title: "They only need the website and search for now",
    buyer: { id: "buyer-kestrel", name: "Kestrel Lane Clinics" },
    proposalSummary: "Annual plan: website, search, social and reporting · ₹1,20,000 + GST",
    barrier: "Their booking page is broken, so they need that fixed now. They can pay ₹50,000 this quarter, and more budget opens in April.",
    proofPoint: "Shows the engine building a smaller standalone phase without discounting the work, with more than one way to pay for it. The merchant keeps the final choice.",
    provenance: "Synthetic scenario",
    bundledRunPath: "data/synthetic/replay/reduced-scope-synthetic-run.json",
    quote: { prePaise: 12_000_000 },
    deal: sharedDeal("case-reduced-scope", [
      {
        id: "reduced-1",
        dealId: "case-reduced-scope",
        author: "merchant",
        text: "Hi, good speaking on Monday. Sharing the annual plan we discussed — website fixes, search marketing, social media and monthly reporting. It comes to ₹1,20,000 plus GST for the year.",
        timestamp: "2026-09-29T16:10:00+05:30",
        source: "whatsapp",
      },
      {
        id: "reduced-2",
        dealId: "case-reduced-scope",
        author: "buyer",
        text: "Thanks. The broken booking page is costing us patient enquiries, so fixing that is urgent.",
        timestamp: "2026-10-01T08:47:00+05:30",
        source: "whatsapp",
      },
      {
        id: "reduced-3",
        dealId: "case-reduced-scope",
        author: "buyer",
        text: "For now, we need the website fixes and search marketing. Social media can wait.",
        timestamp: "2026-10-01T08:48:00+05:30",
        source: "whatsapp",
      },
      {
        id: "reduced-4",
        dealId: "case-reduced-scope",
        author: "buyer",
        text: "I only have ₹50,000 left in this quarter. Our fresh budget opens in April.",
        timestamp: "2026-10-01T08:49:00+05:30",
        source: "whatsapp",
      },
      {
        id: "reduced-5",
        dealId: "case-reduced-scope",
        author: "buyer",
        text: "Anything above ₹60,000 has to go to our MD. If a smaller website-and-search phase fits within the limit, I can move it ahead.",
        timestamp: "2026-10-01T08:50:00+05:30",
        source: "whatsapp",
      },
    ]),
    expected: { extraction: reducedExtraction, engineState: "options_ready", recommendedTemplate: "phased_scope", recordedAnswers: reducedAnswers },
  },
  "preserve-scope": {
    id: "preserve-scope",
    title: "They want everything, but can't pay until May",
    buyer: { id: "buyer-northstar", name: "Northstar Learning Centres" },
    proposalSummary: "Full-year plan · ₹1,20,000 + GST",
    barrier: "They need every service but have only ₹10,000 now. Their next budget opens in May 2027.",
    proofPoint: "Shows the engine preserving full scope by changing timing instead of cutting deliverables. When the extraction cannot map the buyer's required scope to specific services, the merchant confirms them before any offer.",
    provenance: "Synthetic scenario",
    bundledRunPath: "data/synthetic/replay/preserve-scope-synthetic-run.json",
    quote: { prePaise: 12_000_000 },
    deal: sharedDeal("case-preserve-scope", [
      {
        id: "preserve-1",
        dealId: "case-preserve-scope",
        author: "merchant",
        text: "Hi, sharing the annual admissions plan again. It is ₹1,20,000 plus GST for the full year.",
        timestamp: "2026-09-29T16:20:00+05:30",
        source: "whatsapp",
      },
      {
        id: "preserve-2",
        dealId: "case-preserve-scope",
        author: "buyer",
        text: "Thanks. We need the complete annual package for the admissions season, so please don’t remove anything.",
        timestamp: "2026-10-01T08:50:00+05:30",
        source: "whatsapp",
      },
      {
        id: "preserve-3",
        dealId: "case-preserve-scope",
        author: "buyer",
        text: "This quarter is tight. I can release only ₹10,000 right now.",
        timestamp: "2026-10-01T08:51:00+05:30",
        source: "whatsapp",
      },
      {
        id: "preserve-4",
        dealId: "case-preserve-scope",
        author: "buyer",
        text: "Our next campaign budget opens on 1 May. Starting then is fine as long as the full plan stays intact.",
        timestamp: "2026-10-01T08:52:00+05:30",
        source: "whatsapp",
      },
      {
        id: "preserve-5",
        dealId: "case-preserve-scope",
        author: "buyer",
        text: "Finance lets me approve up to ₹15,000 per payment without escalating it. Both the ₹10,000 and ₹15,000 figures are before GST.",
        timestamp: "2026-10-01T08:53:00+05:30",
        source: "whatsapp",
      },
    ]),
    expected: { extraction: preserveExtraction, engineState: "options_ready", recommendedTemplate: "deferred_start", recordedAnswers: [] },
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
