import { describe, expect, it } from "vitest";
import { buildCanonicalTerms, deriveMandateTerms } from "@/domain/agreement";
import { rescheduleLine } from "@/domain/amendment";
import { interpretations } from "@/domain/constraints";
import { enumerateAndEvaluate } from "@/domain/engine";
import { heroMerchant } from "@/data/synthetic/hero";
import { amendmentDiff } from "@/lib/amendment-diff";
import { clarifiedHeroProfile, heroInput } from "../helpers";

const evaluated = enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput()).feasible.find((x) => x.structure.template === "phased_scope" && x.structure.payments.length === 2)!;
const terms = (moved = false) => {
  const structure = moved ? rescheduleLine(evaluated.structure, "pay-2", "2026-12-21") : evaluated.structure;
  return buildCanonicalTerms({ dealId: "d", merchantId: "m", buyerId: "b", structure, gstRateBps: heroMerchant.policy.gstRateBps, mandate: deriveMandateTerms(evaluated.structure, heroMerchant.policy) });
};

describe("canonical amendment differences", () => {
  it("discloses both moved dates and every material item that stayed unchanged", () => {
    const diff = amendmentDiff(terms(), terms(true));
    expect(diff).toContainEqual(expect.objectContaining({ category: "payment_date", changed: true, before: "2026-12-01", after: "2026-12-21", lineId: "pay-2" }));
    expect(diff).toContainEqual(expect.objectContaining({ category: "planned_invoice_date", changed: true, before: "2026-12-01", after: "2026-12-21", lineId: "inv-2", qualifier: "planned_not_issued" }));
    expect(diff).toContainEqual(expect.objectContaining({ category: "amount", changed: false }));
    expect(diff).toContainEqual(expect.objectContaining({ category: "scope", changed: false }));
    expect(diff).toContainEqual(expect.objectContaining({ category: "service_period", changed: false }));
    expect(diff).toContainEqual(expect.objectContaining({ category: "mandate", changed: false, qualifier: "still_fits" }));
  });

  it("never describes changed scope as unchanged", () => {
    const revised = structuredClone(terms(true));
    revised.scope = revised.scope.slice(0, -1);
    expect(amendmentDiff(terms(), revised)).toContainEqual(expect.objectContaining({ category: "scope", changed: true }));
  });
});
