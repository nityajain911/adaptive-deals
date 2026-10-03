import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { interpretations } from "@/domain/constraints";
import { enumerateAndEvaluate } from "@/domain/engine";
import { heroMerchant } from "@/data/synthetic/hero";
import { contextLine, Recommendation, Rejections, SuccessMeasure } from "@/components/offer/recommendation";
import { clarifiedHeroProfile, heroInput } from "../helpers";

/** Spec §5.1: one primary action; rejection and funding detail collapsed in the initial view. */
const top = () => enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput()).feasible.find((x) => x.structure.template === "phased_scope" && x.structure.payments.length === 2)!;

describe("recommendation card", () => {
  const html = renderToStaticMarkup(
    Recommendation({ x: top(), exp: null, policy: heroMerchant.policy, context: contextLine(5_000_000, 6_000_000, true), primary: null }),
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
