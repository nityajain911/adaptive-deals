/**
 * The Northstar Learning Centres case, which was the demo's second case until 13 October 2026. The demo now has Zephyr Logistics there;
 * this copy keeps the "required scope names no service" journey testable, because the product still has that step and no demo case shows it.
 * Tests use it by mocking the case catalog (see `northstarCatalog`).
 */
import type { ExtractionOutput } from "@/ai/schemas";
import { heroMerchant, heroPackages, heroTemplates } from "@/data/synthetic/hero";
import type { DemoCase } from "@/data/synthetic/cases";

const preserveExtraction: ExtractionOutput = {
  fields: [
    { key: "budget_now_amount", raw_text: "₹10,000", evidence_quote: "I can release only ₹10,000 right now", message_id: "preserve-3", confidence: "high" },
    { key: "budget_now_period", raw_text: "this quarter", evidence_quote: "this quarter is tight", message_id: "preserve-3", confidence: "high" },
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

export const northstarCase: DemoCase = {
    id: "preserve-scope",
    title: "They want everything, but can't pay until May",
    buyer: { id: "buyer-northstar", name: "Northstar Learning Centres" },
    proposalSummary: "Full-year plan · ₹1,20,000 + GST",
    barrier: "They need every service but have only ₹10,000 now. Their next budget opens in May 2027.",
    proofPoint: "Shows the engine preserving full scope by changing timing instead of cutting deliverables. When the extraction cannot map the buyer's required scope to specific services, the merchant confirms them before any offer.",
    provenance: "Synthetic scenario",
    bundledRunPath: "data/synthetic/replay/preserve-scope-synthetic-run.json",
    quote: { prePaise: 12_000_000 },
    deal: { dealId: "case-preserve-scope", merchant: heroMerchant, packages: heroPackages, templates: heroTemplates, messages: [
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
        text: "I can release only ₹10,000 right now, as this quarter is tight.",
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
    ] },
    expected: { extraction: preserveExtraction, engineState: "options_ready", recommendedTemplate: "deferred_start", recordedAnswers: [] },
  };

/** The catalog module with the second case swapped for Northstar: `vi.mock("@/data/synthetic/cases", northstarCatalog)`. */
export async function northstarCatalog(original: () => Promise<typeof import("@/data/synthetic/cases")>) {
  const real = await original();
  return {
    ...real,
    demoCase: (id: string) => (id === "preserve-scope" ? northstarCase : real.demoCase(id)),
    allDemoCases: () => real.allDemoCases().map((item) => (item.id === "preserve-scope" ? northstarCase : item)),
  };
}
