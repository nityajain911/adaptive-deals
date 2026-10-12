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
    expect(contextLine(heroBaseline(), 5_000_000, 6_000_000, true)).toBe("Your quote was ₹1,41,600 including GST. They have ₹50,000 including GST this quarter. Their MD must approve anything above ₹60,000.");
  });
  it("shows the most the merchant would spend before being paid only inside the collapsed details", () => {
    const outside = html.replace(/<details[\s\S]*?<\/details>/g, "");
    expect(outside).not.toMatch(/Most you&#x27;d spend before being paid/);
    expect(html).toMatch(/Most you&#x27;d spend before being paid/);
    expect(outside).toContain("Within your limits");
  });
  it("uses forecast language only", () => {
    expect(html).toContain("You&#x27;d keep");
    // The note sits behind an info icon and is not rendered until opened.
    expect(html).toContain('data-testid="offer-keeps-info"');
    expect(html).toContain('data-testid="money-split"');
    expect(html).not.toMatch(/recovered|guaranteed|Realised contribution/i);
  });
  it("distinguishes the two Phase 1 payment choices and explains the split", () => {
    const options = enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput()).feasible;
    const split = options.find((x) => x.structure.template === "phased_scope" && x.structure.payments.length === 2)!;
    const upfront = options.find((x) => x.structure.template === "phased_scope" && x.structure.payments.length === 1)!;
    expect(headlineFor(split)).toContain("two monthly payments");
    expect(headlineFor(upfront)).toContain("paid upfront");
    expect(headlineFor(split)).not.toBe(headlineFor(upfront));
    expect(html).toContain("keeps each payment to ₹23,010");
  });
  it("makes approval-dependent contribution conditional in alternatives", () => {
    const options = enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput()).feasible;
    const phase = options.find((x) => x.structure.template === "phased_scope" && x.structure.payments.length === 2)!;
    const annual = options.find((x) => x.approval === "requires_approval")!;
    expect(alternativeContributionLine(annual)).toMatch(/^If their MD approves, you&#x27;d keep|^If their MD approves, you'd keep/);
    expect(alternativeContributionLine(phase)).toMatch(/^You'd keep about/);
  });
  it("distinguishes an engine recommendation from an option selected by the merchant", () => {
    expect(html).toContain("Suggested offer");
    const annual = enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput()).feasible.find((x) => x.approval === "requires_approval")!;
    const selected = renderToStaticMarkup(Recommendation({ ...CARD, x: annual, reason: whyOffer(annual), context: "Confirmed context", presentation: "merchant_selected" }));
    expect(selected).toContain("You chose this");
    expect(selected).not.toContain("Suggested offer");
    expect(selected).toContain("Needs buyer approval");
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

    expect(html).toContain("we need to know the day their new budget opens");
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
    expect(attribution(html)).toBe("Suggested for the default priority: earning the most.");
    expect(html).toContain("Reason written by code.");
    expect(attribution(html)).not.toMatch(/\bAI\b|Groq|model/);
  });
  it("keeps a recorded model's order and note out of the decision card", () => {
    const html = card({ evidence: evidenceFor(GROQ, recorded(GROQ)) });
    expect(html).not.toContain('data-testid="recorded-evidence"');
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
    expect(html).toContain("You chose this");
    expect(attribution(html)).toBe("You chose this offer.");
  });
  it("says what caused a recalculation, and never shows a parent run's note", () => {
    const html = card({ attribution: strategyAttribution({ strategyChosen: false, selectedByMerchant: false, branchCause: "the buyer's answer" }), evidence: null });
    expect(attribution(html)).toMatch(/^Worked out again after the buyer&#x27;s answer/);
    expect(html).not.toContain(NOTE);
  });
  it("says it is based on the merchant's prices & costs, and any changes made for this deal", () => {
    // "prices & costs" is a link to the page where they are set, so compare the visible text.
    const text = (html: string) => html.replace(/<[^>]+>/g, "");
    expect(text(card())).toContain("Based onyour prices &amp; costs");
    expect(card()).toContain('href="/economics"');
    expect(text(card({ economics: { version: 2, overrides: 2 } }))).toContain("your prices &amp; costs and 2 changes you made for this deal");
  });
  it("shows the most the merchant would spend before being paid, and keeps the forecast wording", () => {
    const html = card();
    expect(html).toContain("Most you&#x27;d spend before being paid");
    // The note sits behind an info icon and is not rendered until opened.
    expect(html).toContain('data-testid="offer-keeps-info"');
    expect(html).toContain('data-testid="money-split"');
  });
});
