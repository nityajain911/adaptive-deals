import { describe, expect, it } from "vitest";
import { describeInputChange, describeReevaluation } from "@/lib/reevaluation-copy";
import type { ReevaluationPreview } from "@/lib/reevaluation";

const names = ["Website fixes", "Search marketing", "Social media", "Monthly reporting"];
const preview = (over: Partial<ReevaluationPreview> = {}): ReevaluationPreview => ({
  fromVersion: 1, toVersion: 2, blocked: [], changesInputs: true, inputChanges: [], pricesNote: "Service prices are unchanged for this deal.",
  becomesFeasible: [], becomesInfeasible: [], recommendationChanges: false, staleDraftVersion: null, ...over,
});

describe("what a changed input means to the merchant", () => {
  it.each([
    [{ field: "packages[0].directCostPaise", from: "1200000", to: "1500000" }, "Website fixes · delivery cost: ₹12,000 → ₹15,000"],
    [{ field: "packages[2].deferrable", from: "true", to: "false" }, "Social media · can start later: yes → no"],
    [{ field: "policy.cashAtRiskLimitPaise", from: "1000000", to: "500000" }, "Most I'll spend before I'm paid: ₹10,000 → ₹5,000"],
    [{ field: "policy.discountLimitBps", from: "0", to: "1000" }, "Biggest discount I'll give: 0% → 10%"],
    [{ field: "policy.contributionFloor.minPercentBps", from: "3500", to: "4000" }, "Lowest profit I'll accept: 35% → 40%"],
    [{ field: "policy.smallestInstalmentPaise", from: "1000000", to: "500000" }, "Minimum payment: ₹10,000 → ₹5,000"],
    [{ field: "policy.maxTenureMonths", from: "12", to: "9" }, "Maximum payment duration: 12 months → 9 months"],
    [{ field: "policy.paymentFeeBps", from: "200", to: "250" }, "Expected payment fee: 2% → 2.5%"],
    [{ field: "templates.discountsBps[1]", from: "not set", to: "500" }, "Approved discount level: not set → 5%"],
  ])("%j", (change, expected) => {
    expect(describeInputChange(change, names)).toBe(expected);
  });

  it("falls back to the raw field name rather than inventing a meaning", () => {
    expect(describeInputChange({ field: "templates.split_payment.plans[0].label", from: "a", to: "b" }, names)).toBe("templates.split_payment.plans[0].label: a → b");
  });
});

describe("the re-evaluation summary", () => {
  it("counts changes with the right plural", () => {
    expect(describeReevaluation(preview({ inputChanges: [{ field: "policy.maxTenureMonths", from: "12", to: "9" }] })).headline).toBe("1 input would change.");
    expect(describeReevaluation(preview({ inputChanges: [1, 2].map((n) => ({ field: "policy.maxTenureMonths", from: "12", to: String(n) })) })).headline).toBe("2 inputs would change.");
  });
  it("says nothing about offers when the version cannot be applied, because nothing was computed", () => {
    expect(describeReevaluation(preview({ blocked: ["Search marketing now depends on Analytics setup, which was not part of this deal."] }))).toEqual({ headline: "This version cannot be applied to this deal.", effects: [] });
  });
  it("says what happens to the offers, the recommendation and an unsent draft, and nothing it does not know", () => {
    const quiet = describeReevaluation(preview({ inputChanges: [{ field: "policy.maxTenureMonths", from: "12", to: "9" }] }));
    expect(quiet.effects).toEqual(["Every offer that is available now stays available.", "The recommended offer stays the same."]);
    const loud = describeReevaluation(preview({ becomesInfeasible: ["a", "b"], becomesFeasible: ["c"], recommendationChanges: true, staleDraftVersion: 3, inputChanges: [{ field: "policy.maxTenureMonths", from: "12", to: "9" }] }));
    expect(loud.effects).toEqual([
      "2 offers would no longer pass your rules.",
      "1 offer would become available.",
      "The recommended offer would change.",
      "Your unsent draft (version 3) would be set aside and prepared again.",
    ]);
  });
});
