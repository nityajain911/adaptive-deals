import { describe, expect, it } from "vitest";
import { applyClarificationAnswer, ClarificationError, interpretations } from "@/domain/constraints";
import { buyerChecks } from "@/domain/checks";
import { enumerateAndEvaluate, evaluateDeal } from "@/domain/engine";
import { heroClarificationAnswers as A, heroMessages, HERO_BUYER_MESSAGE } from "@/data/synthetic/hero";
import { clarifiedHeroProfile, extraction, field, heroInput, msg, profileFrom } from "../helpers";

/**
 * The profile keeps one GST basis, but it applies to an amount only when that amount's basis
 * was confirmed explicitly. An answer or statement about ₹50,000 never settles ₹60,000.
 */
describe("GST basis of the budget and the approval limit", () => {
  it("the hero clarification names both amounts and the pinned answer covers both", () => {
    expect(A.gst.question).toBe("Do both ₹50,000 and ₹60,000 include GST?");
    expect(A.gst.answerText).toBe("Yes, both amounts include GST.");
    expect(A.gst.coversAmounts).toEqual(["budgetNow", "approvalLimit"]);
    expect(A.approvalScope.question).toBe("Is ₹60,000 the limit per payment or for the full contract?");
    expect(A.approvalScope.answerText).toBe("₹60,000 is per contract.");
  });

  it("an answer that mentions only ₹50,000 is refused and leaves the GST basis open", () => {
    const before = profileFrom();
    const onlyBudget = { ...A.gst, question: "Does ₹50,000 include GST?", answerText: "Yes, ₹50K includes GST.", coversAmounts: ["budgetNow" as const] };
    expect(() => applyClarificationAnswer(before, "amountsIncludeGst", "yes", onlyBudget)).toThrow(ClarificationError);
    expect(() => applyClarificationAnswer(before, "amountsIncludeGst", "yes", { ...onlyBudget, coversAmounts: undefined })).toThrow(/approvalLimit/);
    expect(before.amountsIncludeGst.status).toBe("ambiguous");
    const e = evaluateDeal(applyClarificationAnswer(before, "approvalScope", "per_contract", A.approvalScope), heroInput());
    expect(e.state).toBe("ambiguous");
    expect(e.ambiguities.map((a) => a.field)).toContain("amountsIncludeGst");
  });

  it("a message that attaches GST only to ₹50,000 does not settle the basis of ₹60,000", () => {
    const text = "Only ₹50K incl GST left this quarter; anything above ₹60K needs MD approval for the whole contract.";
    const p = profileFrom(
      extraction([
        field("budget_now_amount", "₹50K", "Only ₹50K incl GST left this quarter"),
        field("budget_now_period", "this quarter", "Only ₹50K incl GST left this quarter"),
        field("amounts_include_gst", "incl GST", "Only ₹50K incl GST left this quarter"),
        field("approval_limit_amount", "₹60K", "anything above ₹60K needs MD approval"),
        field("approval_limit_scope", "for the whole contract", "needs MD approval for the whole contract"),
      ]),
      [msg(text)],
    );
    expect(p.amountsIncludeGst.status).toBe("ambiguous");
    expect(p.amountsIncludeGst.note).toMatch(/not confirmed for ₹60K/);
    expect(evaluateDeal(p, heroInput()).state).toBe("ambiguous");
  });

  it("the approval check refuses a GST basis that was not confirmed for the limit", () => {
    const c = interpretations(clarifiedHeroProfile())[0].constraints;
    const s = enumerateAndEvaluate(c, heroInput()).feasible[0].structure;
    const budgetOnly = { ...c, gstBasis: { source: "clarification:partial", covers: ["budgetNow" as const] } };
    const approval = buyerChecks(s, budgetOnly).find((x) => x.id === "buyer_approval")!;
    expect(approval).toMatchObject({ status: "needs_information", code: "APPROVAL_BASIS_UNKNOWN" });
    expect(buyerChecks(s, budgetOnly).find((x) => x.id === "buyer_budget")!.status).toBe("pass");
  });

  it("with both amounts confirmed, the approval comparison uses the GST-inclusive total and cites the confirmation", () => {
    const p = clarifiedHeroProfile();
    expect(p.amountsIncludeGst).toMatchObject({ status: "stated", value: "yes", covers: ["budgetNow", "approvalLimit"] });
    const r = enumerateAndEvaluate(interpretations(p)[0].constraints, heroInput());
    const top = r.feasible[0];
    const approval = top.buyerChecks.find((x) => x.id === "buyer_approval")!;
    const total = top.structure.payments.reduce((a, x) => a + x.totalPaise, 0);
    expect(approval.facts).toMatchObject({ measuredPaise: total, limitPaise: 6_000_000, gstIncluded: "yes", gstBasisSource: "clarification:clar-gst", scope: "per_contract" });
    expect(total).toBe(4_602_000);
  });

  it("hero messages are unchanged", () => {
    expect(heroMessages[1].text).toBe(HERO_BUYER_MESSAGE);
  });
});
