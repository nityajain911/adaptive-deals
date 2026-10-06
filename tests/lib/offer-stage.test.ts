import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { interpretations } from "@/domain/constraints";
import { enumerateAndEvaluate } from "@/domain/engine";
import { heroMerchant } from "@/data/synthetic/hero";
import { contextLine, Recommendation, Rejections, SuccessMeasure } from "@/components/offer/recommendation";
import { alternativeContributionLine, headlineFor } from "@/lib/offer-copy";
import type { ExplanationResult } from "@/ai/explain";
import type { ModelProvenance } from "@/lib/model-provenance";
import { clarifiedHeroProfile, heroInput } from "../helpers";

const SAMPLE: ModelProvenance = { source: "hand_written", modelMade: false, providerName: null, label: "Sample output written by hand · no model ran" };
const GROQ: ModelProvenance = { source: "recorded_model", modelMade: true, providerName: "Groq", label: "Recorded Groq output" };

/** Spec §5.1: one primary action; rejection and funding detail collapsed in the initial view. */
const top = () => enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput()).feasible.find((x) => x.structure.template === "phased_scope" && x.structure.payments.length === 2)!;

describe("recommendation card", () => {
  const html = renderToStaticMarkup(
    Recommendation({ x: top(), exp: null, policy: heroMerchant.policy, context: contextLine(5_000_000, 6_000_000, true), primary: null, presentation: "recommended", provenance: SAMPLE }),
  );
  it("keeps the GST basis and per-contract scope in the context line", () => {
    expect(contextLine(5_000_000, 6_000_000, true)).toBe("Original annual proposal: ₹1,41,600 including GST. The buyer has ₹50,000 including GST this quarter. Contracts above ₹60,000 including GST require MD approval.");
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
    const selected = renderToStaticMarkup(Recommendation({ x: annual, exp: null, policy: heroMerchant.policy, context: "Confirmed context", primary: null, presentation: "merchant_selected", provenance: SAMPLE }));
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
  const exp = (notes: ExplanationResult["notes"]): ExplanationResult => ({ order: [x.structure.id], options: [], comparisonTemplate: "", comparison: "", notes, source: { ranking: "ai", text: "ai" }, issues: [] });
  const card = (e: ExplanationResult, provenance: ModelProvenance) =>
    renderToStaticMarkup(Recommendation({ x, exp: e, policy: heroMerchant.policy, context: "Confirmed context", primary: null, presentation: "recommended", provenance }));
  const attribution = (html: string) => /data-testid="attribution">([^<]*)</.exec(html)![1];

  it("credits a hand-written sample to nobody's model, with or without a note for this offer", () => {
    for (const html of [card(exp([]), SAMPLE), card(exp([{ structureId: x.structure.id, text: "Keeps the urgent work inside the confirmed limit." }]), SAMPLE)]) {
      expect(attribution(html)).toMatch(/^Sample order/);
      expect(attribution(html)).toContain("no model ran");
      expect(attribution(html)).not.toMatch(/\bAI\b|Groq/);
    }
  });
  it("says code explained when the text shown is code's, even if the model wrote other text", () => {
    expect(attribution(card(exp([]), GROQ))).toBe("Groq ranked · code explained · recorded Groq output · all figures calculated by the engine");
  });
  it("credits the recorded model with the explanation only when its note is the text shown", () => {
    const html = card(exp([{ structureId: x.structure.id, text: "Keeps the urgent work inside the confirmed limit." }]), GROQ);
    expect(html).toContain("Keeps the urgent work inside the confirmed limit.");
    expect(attribution(html)).toMatch(/^Groq ranked and explained · recorded Groq output/);
  });
});
