import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { interpretations } from "@/domain/constraints";
import { enumerateAndEvaluate } from "@/domain/engine";
import { heroMerchant, heroPackages } from "@/data/synthetic/hero";
import { contextLine, Recommendation, Rejections, SuccessMeasure } from "@/components/offer/recommendation";
import { alternativeContributionLine, headlineFor, whyOffer } from "@/lib/offer-copy";
import type { ExplanationResult } from "@/ai/explain";
import type { ModelProvenance } from "@/lib/model-provenance";
import { clarifiedHeroProfile, heroBaseline, heroInput } from "../helpers";
import { recordedEvidence, strategyAttribution } from "@/lib/strategy-copy";

const SAMPLE: ModelProvenance = { source: "hand_written", modelMade: false, providerName: null, label: "Sample output written by hand · no model ran" };
const GROQ: ModelProvenance = { source: "recorded_model", modelMade: true, providerName: "Groq", label: "Recorded Groq output" };

const CARD = { policy: heroMerchant.policy, baseline: heroBaseline(), packages: heroPackages, reason: "Reason written by code.", attribution: strategyAttribution({ strategyChosen: false, selectedByMerchant: false }), economics: { version: 1, overrides: 0 }, primary: null };

/** Spec §5.1: one primary action; rejection and funding detail collapsed in the initial view. */
const top = () => enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput()).feasible.find((x) => x.structure.template === "phased_scope" && x.structure.payments.length === 2)!;

describe("recommendation card", () => {
  const html = renderToStaticMarkup(
    Recommendation({ ...CARD, x: top(), reason: whyOffer(top()), context: contextLine(heroBaseline(), 5_000_000, 6_000_000, true), presentation: "recommended" }),
  );
  it("keeps the GST basis and per-contract scope in the context line", () => {
    expect(contextLine(heroBaseline(), 5_000_000, 6_000_000, true)).toBe("Original annual proposal: ₹1,41,600 including GST. The buyer has ₹50,000 including GST this quarter. Contracts above ₹60,000 including GST require MD approval.");
  });
  it("shows the funding requirement and cash-at-risk limit only inside the collapsed details", () => {
    const outside = html.replace(/<details[\s\S]*?<\/details>/g, "");
    expect(outside).not.toMatch(/Peak funding requirement|Cash-at-risk limit/);
    expect(html).toMatch(/Peak funding requirement/);
    expect(outside).toContain("Passes your configured contribution and funding rules.");
  });
  it("uses forecast language only", () => {
    expect(html).toContain("Projected contribution");
    expect(html).not.toMatch(/recovered|guaranteed|Realised contribution/i);
  });
  it("distinguishes the two Phase 1 payment choices and explains the split", () => {
    const options = enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput()).feasible;
    const split = options.find((x) => x.structure.template === "phased_scope" && x.structure.payments.length === 2)!;
    const upfront = options.find((x) => x.structure.template === "phased_scope" && x.structure.payments.length === 1)!;
    expect(headlineFor(split)).toContain("two monthly payments");
    expect(headlineFor(upfront)).toContain("paid upfront");
    expect(headlineFor(split)).not.toBe(headlineFor(upfront));
    expect(html).toContain("lowering the largest payment");
  });
  it("makes approval-dependent contribution conditional in alternatives", () => {
    const options = enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput()).feasible;
    const phase = options.find((x) => x.structure.template === "phased_scope" && x.structure.payments.length === 2)!;
    const annual = options.find((x) => x.approval === "requires_approval")!;
    expect(alternativeContributionLine(annual)).toMatch(/^If the buyer secures MD approval: projected contribution/);
    expect(alternativeContributionLine(phase)).toMatch(/^Projected contribution/);
  });
  it("distinguishes an engine recommendation from an option selected by the merchant", () => {
    expect(html).toContain("Recommended offer");
    const annual = enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput()).feasible.find((x) => x.approval === "requires_approval")!;
    const selected = renderToStaticMarkup(Recommendation({ ...CARD, x: annual, reason: whyOffer(annual), context: "Confirmed context", presentation: "merchant_selected" }));
    expect(selected).toContain("Selected by you");
    expect(selected).not.toContain("Recommended offer");
    expect(selected).toContain("requires the buyer&#x27;s MD approval");
    expect(selected).not.toContain("fits the buyer&#x27;s confirmed budget, timing and approval limit");
  });
  it("success measure names the target metric", () => {
    expect(renderToStaticMarkup(SuccessMeasure())).toContain("Success measure: realised contribution from this deal within 90 days.");
  });
});

describe("rejection and needs-information reasons", () => {
  it("shows the engine's needs-information explanation instead of an empty reason", () => {
    const result = enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput());
    expect(result.needsInformation).not.toHaveLength(0);
    const html = renderToStaticMarkup(Rejections({ r: result }));

    expect(html).toContain("we need the day the new budget opens");
    expect(html).not.toMatch(/<span class="text-red"> · <\/span>/);
  });
});

describe("recommendation attribution on the card", () => {
  const x = top();
  const NOTE = "Keeps the urgent work inside the confirmed limit.";
  const recorded = (provenance: ModelProvenance, ranking: "ai" | "code" = "ai", notes = [{ structureId: x.structure.id, text: NOTE }]): ExplanationResult => ({
    order: [x.structure.id], options: [], comparisonTemplate: "", comparison: "", notes, source: { ranking, text: notes.length ? "ai" : "code_fallback" }, issues: [],
  });
  const evidenceFor = (provenance: ModelProvenance, exp: ExplanationResult | null, matchesRecording = true) => recordedEvidence({ exp, provenance, matchesRecording, shownId: x.structure.id, headline: headlineFor2 });
  const headlineFor2 = (id: string) => (id === x.structure.id ? headlineFor(x) : id);
  const card = (over: Partial<Parameters<typeof Recommendation>[0]> = {}) => renderToStaticMarkup(Recommendation({ ...CARD, x, context: "Confirmed context", presentation: "recommended", ...over }));
  const attribution = (html: string) => /data-testid="attribution">([^<]*)</.exec(html)![1];

  it("credits code, and no model, for the ranking and the reason shown", () => {
    const html = card();
    expect(attribution(html)).toBe("Default strategy · offers ranked by code · explained by code · figures calculated by the engine.");
    expect(html).toContain("Reason written by code.");
    expect(attribution(html)).not.toMatch(/\bAI\b|Groq|model/);
  });
  it("keeps a recorded model's order and note out of the visible card, behind an information control, as history", () => {
    const html = card({ evidence: evidenceFor(GROQ, recorded(GROQ)) });
    expect(html).toContain('data-testid="recorded-evidence"');
    // The popover's content is not rendered until it is opened, so none of it is on the card.
    expect(html).not.toContain(NOTE);
    expect(html).not.toContain("Historical evidence");
    expect(attribution(html)).not.toMatch(/Groq|ranked by Groq/);
  });
  it("shows no evidence control when the economics differ from the recording, or no model wrote anything", () => {
    expect(card({ evidence: evidenceFor(GROQ, recorded(GROQ), false) })).not.toContain("recorded-evidence");
    expect(card({ evidence: evidenceFor(GROQ, recorded(GROQ, "code", [])) })).not.toContain("recorded-evidence");
    expect(card({ evidence: evidenceFor(SAMPLE, null) })).not.toContain("recorded-evidence");
  });
  it("on the option the merchant selected, says the merchant chose it and that code ranked the others", () => {
    const html = card({ presentation: "merchant_selected", attribution: strategyAttribution({ strategyChosen: true, selectedByMerchant: true }) });
    expect(html).toContain("Selected by you");
    expect(attribution(html)).toBe("You selected this offer · other offers ranked by code under your strategy · explained by code · figures calculated by the engine.");
  });
  it("says what caused a recalculation, and never shows a parent run's note", () => {
    const html = card({ attribution: strategyAttribution({ strategyChosen: false, selectedByMerchant: false, branchCause: "the buyer's answer" }), evidence: null });
    expect(attribution(html)).toMatch(/^Recalculated by the engine after the buyer&#x27;s answer · /);
    expect(html).not.toContain(NOTE);
  });
  it("says which version of the merchant's economics it is based on, and any deal overrides", () => {
    // "business economics" is now a link to the page where the rules are set, so compare the visible text.
    const text = (html: string) => html.replace(/<[^>]+>/g, "");
    expect(text(card())).toContain("Based on version 1 of your business economics.");
    expect(card()).toContain('href="/economics"');
    expect(text(card({ economics: { version: 2, overrides: 2 } }))).toContain("Based on version 2 of your business economics · 2 deal overrides applied.");
  });
  it("states the cash exposure and keeps the forecast wording", () => {
    const html = card();
    expect(html).toContain("Cash exposure: ");
    expect(html).toContain("You keep this after configured costs and expected fees. A forecast, not a result.");
  });
});
