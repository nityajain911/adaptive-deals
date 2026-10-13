/**
 * The Blue Harbor Foods case, which was the demo's third case until 13 October 2026 (a buyer who must start in two weeks, so no approved offer fits).
 * The demo now has Lotus Row Interiors there; this copy keeps the "no approved offer fits" journey testable, because the product still has
 * that screen and the demo's cases all reach an offer. Tests use it by mocking the case catalog (see `blueHarborCatalog`).
 */
import type { ExtractionOutput } from "@/ai/schemas";
import { heroMerchant, heroPackages, heroTemplates } from "@/data/synthetic/hero";
import type { DemoCase } from "@/data/synthetic/cases";

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

export const blueHarborCase: DemoCase = {
    id: "no-fit",
    title: "They want to start in two weeks",
    buyer: { id: "buyer-blueharbor", name: "Blue Harbor Foods" },
    proposalSummary: "Launch support · ₹1,20,000 + GST",
    barrier: "Their launch date can't move, and you can't start that soon.",
    proofPoint: "Shows a clean extraction followed by justified abstention: every merchant-approved structure breaks a buyer constraint, so the engine rejects them all.",
    provenance: "Synthetic scenario",
    bundledRunPath: "data/synthetic/replay/no-fit-synthetic-run.json",
    quote: { prePaise: 12_000_000 },
    deal: { dealId: "case-no-fit", merchant: heroMerchant, packages: heroPackages, templates: heroTemplates, messages: [
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
    ] },
    expected: { extraction: noFitExtraction, engineState: "no_feasible_deal", recommendedTemplate: null, recordedAnswers: [] },
  };

/** The catalog module with the third case swapped for Blue Harbor: `vi.mock("@/data/synthetic/cases", blueHarborCatalog)`. */
export async function blueHarborCatalog(original: () => Promise<typeof import("@/data/synthetic/cases")>) {
  const real = await original();
  return {
    ...real,
    demoCase: (id: string) => (id === "no-fit" ? blueHarborCase : real.demoCase(id)),
    allDemoCases: () => real.allDemoCases().map((item) => (item.id === "no-fit" ? blueHarborCase : item)),
  };
}
