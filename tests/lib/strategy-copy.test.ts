import { describe, expect, it } from "vitest";
import { recordedEvidence, strategyAttribution } from "@/lib/strategy-copy";
import type { ExplanationResult } from "@/ai/explain";
import type { ModelProvenance } from "@/lib/model-provenance";

const GROQ: ModelProvenance = { source: "recorded_model", modelMade: true, providerName: "Groq", label: "Recorded Groq output" };
const SAMPLE: ModelProvenance = { source: "hand_written", modelMade: false, providerName: null, label: "Sample output written by hand · no model ran" };
const exp = (over: Partial<ExplanationResult> = {}): ExplanationResult => ({
  order: ["b", "c", "a"], options: [], comparisonTemplate: "", comparison: "", notes: [{ structureId: "c", text: "Splits the payment across two months." }],
  source: { ranking: "ai", text: "code_fallback" }, issues: [], ...over,
});
const headline = (id: string) => ({ a: "Annual split", b: "Paid upfront", c: "Two payments" })[id] ?? id;

describe("who ranked and who explained, on the offer card", () => {
  it("says the default strategy was not a choice, and that code ranked and explained", () => {
    expect(strategyAttribution({ strategyChosen: false, selectedByMerchant: false })).toBe("Default strategy · offers ranked by code · explained by code · figures calculated by the engine.");
  });
  it("says the merchant chose the strategy when they did", () => {
    expect(strategyAttribution({ strategyChosen: true, selectedByMerchant: false })).toBe("Strategy selected by you · offers ranked by code · explained by code · figures calculated by the engine.");
  });
  it("credits the merchant for an offer they selected themselves, and still says code ranked", () => {
    expect(strategyAttribution({ strategyChosen: true, selectedByMerchant: true })).toBe("You selected this offer · other offers ranked by code under your strategy · explained by code · figures calculated by the engine.");
  });
  it("keeps saying what caused a recalculation, because the parent run did not process it", () => {
    expect(strategyAttribution({ strategyChosen: false, selectedByMerchant: false, branchCause: "the merchant confirmed the services" })).toBe(
      "Recalculated by the engine after the merchant confirmed the services · Default strategy · offers ranked by code · explained by code · figures calculated by the engine.",
    );
    expect(strategyAttribution({ strategyChosen: true, selectedByMerchant: true, branchCause: "the buyer's answer" })).toMatch(/^Recalculated by the engine after the buyer's answer · You selected this offer/);
  });
  it("never names a model or an AI, because none ranked or explained anything shown", () => {
    for (const a of [false, true]) for (const b of [false, true]) expect(strategyAttribution({ strategyChosen: a, selectedByMerchant: b })).not.toMatch(/\bAI\b|Groq|model/i);
  });
});

describe("the recorded model's order and reason, kept as history", () => {
  const base = { exp: exp(), provenance: GROQ, matchesRecording: true, shownId: "c", headline };
  it("is labelled as historical evidence that does not drive the recommendation, and shows the order and the reason for the shown offer", () => {
    expect(recordedEvidence(base)).toEqual({
      heading: "Historical evidence from the recorded Groq run. It does not drive the current recommendation.",
      order: "Recorded order: Paid upfront → Two payments → Annual split",
      reason: "Splits the payment across two months.",
    });
  });
  it("is absent when the deal's economics differ from what the run was recorded under", () => {
    expect(recordedEvidence({ ...base, matchesRecording: false })).toBeNull();
  });
  it("is absent when no model produced an order or a validated reason", () => {
    expect(recordedEvidence({ ...base, exp: exp({ source: { ranking: "code", text: "code_fallback" }, notes: [] }) })).toBeNull();
    expect(recordedEvidence({ ...base, exp: null })).toBeNull();
  });
  it("shows the validated reason alone when the model's order was not used", () => {
    expect(recordedEvidence({ ...base, exp: exp({ source: { ranking: "code", text: "code_fallback" } }) })).toMatchObject({ order: null, reason: "Splits the payment across two months." });
  });
  it("labels a hand-written sample as a sample, never as a recorded model run", () => {
    const ev = recordedEvidence({ ...base, provenance: SAMPLE })!;
    expect(ev.heading).toBe("Sample order and reason written by hand · no model ran. They do not drive the current recommendation.");
    expect(ev.order).toBe("Sample order: Paid upfront → Two payments → Annual split");
    expect(JSON.stringify(ev)).not.toMatch(/Groq|recorded/i);
  });
  it("has no reason line for an offer the model wrote nothing about", () => {
    expect(recordedEvidence({ ...base, shownId: "a" })).toMatchObject({ reason: null });
  });
});
