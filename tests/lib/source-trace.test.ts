import { describe, expect, it } from "vitest";
import { buildEconomicsEvidenceDraft } from "@/commercial-memory/economics-draft";
import { loadBundledKnowledgeSources } from "@/commercial-memory/source-schema";
import type { FieldCard } from "@/ai/run-record";
import type { Message } from "@/domain/types";
import { defaultEconomics } from "@/lib/economics-default";
import { sourceTracesForDeal } from "@/lib/source-trace";

const buyerMessage: Message = {
  id: "buyer-1",
  dealId: "deal-1",
  author: "buyer",
  text: "We have ₹50,000 left this quarter, including GST.",
  timestamp: "2026-10-01T09:00:00+05:30",
  source: "whatsapp",
};

const buyerProfile: FieldCard[] = [{
  key: "budgetNow",
  label: "Budget now",
  rawText: "₹50,000",
  display: "₹50,000 this quarter",
  status: "stated",
  evidence: [{ quote: "₹50,000 left this quarter", messageId: "buyer-1", start: 8, end: 33 }],
  transformation: "₹50,000 → ₹50,000",
  confidence: "high",
  note: null,
  confirmedBy: null,
}];

describe("source-to-decision traces", () => {
  it("maps a verified buyer quote to its constraint and decision use with a stable source id", () => {
    const traces = sourceTracesForDeal({ profile: buyerProfile, messages: [buyerMessage] });
    expect(traces).toEqual([expect.objectContaining({
      id: "trace-buyer-budgetNow-buyer-1-8-33",
      sourceKind: "buyer_message",
      sourceId: "buyer-1",
      sourceLabel: "Buyer message",
      quote: "₹50,000 left this quarter",
      derivedLabel: "Budget now",
      derivedValue: "₹50,000 this quarter",
      usage: "Used to check which payments fit now",
    })]);
    expect(buyerMessage.text.slice(8, 33)).toBe(traces[0].quote);
    expect(`${traces[0].derivedLabel} ${traces[0].usage}`).not.toMatch(/cost|margin|profit|merchant rule/i);
  });

  it("maps an exact business-document line to the value used by the economics calculation", () => {
    const sources = loadBundledKnowledgeSources();
    const draft = buildEconomicsEvidenceDraft(defaultEconomics(), sources, "2026-10-08");
    const traces = sourceTracesForDeal({ profile: [], messages: [], documentDraft: draft, documentSources: sources });
    const cost = traces.find((trace) => trace.id.includes("services.website-fixes.directCostPaise"))!;
    const source = sources.find((item) => item.id === cost.sourceId)!;
    expect(cost).toMatchObject({
      sourceKind: "business_document",
      derivedLabel: "Website fixes delivery cost",
      derivedValue: "₹12,000",
      usage: "Used to calculate what you keep",
    });
    expect(source.content).toContain(cost.quote);
    expect(cost.id).toContain(cost.sourceId);
  });

  it("suppresses buyer and document traces whose stored provenance no longer reproduces the quote", () => {
    const sources = loadBundledKnowledgeSources();
    const draft = buildEconomicsEvidenceDraft(defaultEconomics(), sources, "2026-10-08");
    const invalidDraft = {
      ...draft,
      proposals: [{ ...draft.proposals[0], start: draft.proposals[0].start + 1 }],
    };
    const traces = sourceTracesForDeal({
      profile: buyerProfile,
      messages: [{ ...buyerMessage, text: "The buyer changed this message." }],
      documentDraft: invalidDraft,
      documentSources: sources,
    });
    expect(traces.some((trace) => trace.sourceKind === "buyer_message")).toBe(false);
    expect(traces.some((trace) => trace.sourceKind === "business_document")).toBe(false);
  });
});
