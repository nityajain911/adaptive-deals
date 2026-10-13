import { describe, expect, it } from "vitest";
import { interpretations } from "@/domain/constraints";
import { enumerateAndEvaluate } from "@/domain/engine";
import { heroMerchant, heroPackages } from "@/data/synthetic/hero";
import { alternativeContributionLine, approxINR, counterReason, joinRules, headlineFor, offerSummary } from "@/lib/offer-copy";
import { originalProposalOf } from "@/lib/deal-context";
import { clarifiedHeroProfile, heroBaseline, heroInput } from "../helpers";

/** Spec §5.1: code-written headlines and the original-proposal comparison. */
const r = () => enumerateAndEvaluate(interpretations(clarifiedHeroProfile())[0].constraints, heroInput());
const byTemplate = (t: string) => r().structures.find((x) => x.structure.template === t)!;
const heroTop = () => r().feasible.find((x) => x.structure.template === "phased_scope" && x.structure.payments.length === 2)!;
const GST = heroMerchant.policy.gstRateBps;

describe("code-written headlines by template", () => {
  it("one headline per template type, chosen from the engine template", () => {
    expect(headlineFor(byTemplate("phased_scope"))).toBe("Start with a three-month package · paid upfront");
    expect(headlineFor(byTemplate("split_payment"))).toBe("Keep the full project and split the payments");
    expect(headlineFor(byTemplate("deferred_start"))).toBe("Start when their next budget opens");
    expect(headlineFor(byTemplate("shorter_commitment"))).toBe("Offer a three-month commitment · paid upfront");
  });
});

describe("forecast figures are rounded for the decision", () => {
  it("rounds a forecast to the nearest rupee with 'about', and leaves exact figures to the detail", () => {
    expect(approxINR(1_932_960)).toBe("about ₹19,330");
    expect(approxINR(1_932_949)).toBe("about ₹19,329");
    expect(approxINR(0)).toBe("about ₹0");
    expect(approxINR(-5_050)).toBe("about −₹51");
  });
  it("is used in the alternative rows", () => {
    expect(alternativeContributionLine(heroTop())).toBe("You'd keep about ₹19,330");
  });
});

describe("original proposal and offer summary", () => {
  it("₹1,20,000 pre-GST + 18% GST = ₹1,41,600", () => {
    expect(originalProposalOf(heroBaseline())).toEqual({ prePaise: 12_000_000, gstPaise: 2_160_000, totalPaise: 14_160_000, gstRateBps: 1800 });
  });
  it("hero offer: achieves and changes, with the ₹95,580 difference on a matching GST basis", () => {
    const s = offerSummary(heroTop(), heroBaseline(), heroPackages, GST);
    expect(s.achieves).toEqual([
      "A sale of ₹46,020 including GST.",
      "You'd keep about ₹19,330 after your costs and fees.",
      "A three-month package the buyer can approve on their own.",
    ]);
    expect(s.changes).toEqual([
      "Social media and months 4–12 are left out.",
      "₹95,580 less than your original quote.",
      "Nothing beyond the three months is promised.",
    ]);
    expect([...s.achieves, ...s.changes].join(" ")).not.toMatch(/lost|recovered|realised|guaranteed/i);
  });
  it("omits the difference when the GST bases differ", () => {
    const baseline = heroBaseline();
    const s = offerSummary(heroTop(), { ...baseline, gstRateBps: 0 }, heroPackages, GST);
    expect(s.changes.join(" ")).not.toMatch(/₹95,580|lower than/);
  });
});

describe("the reason shown for a merchant's counter-offer", () => {
  it("never says the offer passes the rules when the merchant overrode one", () => {
    const text = counterReason(["Discount 13.08% is above the 0% limit."]);
    expect(text).toBe("You set this total in answer to the buyer. It is outside your limits: Discount 13.08% is above the 0% limit. You chose to go ahead anyway.");
    expect(text).not.toMatch(/passes your rules/i);
  });
  it("joins several failed rules cleanly, without a stray full stop before each semicolon", () => {
    const text = counterReason(["Projected contribution is below the 35% floor.", "Discount 13.08% is above the 0% limit."]);
    expect(text).toBe("You set this total in answer to the buyer. It is outside your limits: Projected contribution is below the 35% floor; Discount 13.08% is above the 0% limit. You chose to go ahead anyway.");
    expect(text).not.toContain(".;");
    expect(joinRules(["A is wrong.", "B is wrong."])).toBe("A is wrong; B is wrong.");
    expect(joinRules(["Only one."])).toBe("Only one.");
  });
  it("says so plainly when every rule passes", () => {
    expect(counterReason([])).toBe("You set this total in answer to the buyer. It is within all your limits.");
  });
});
