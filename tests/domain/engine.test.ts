import { describe, expect, it } from "vitest";
import { applyClarificationAnswer, interpretations, type RawExtraction } from "@/domain/constraints";
import { enumerateAndEvaluate, evaluateDeal, enforceApprovalOrder, type EvaluatedStructure } from "@/domain/engine";
import { enumerateStructures } from "@/domain/structures";
import { rupees } from "@/domain/money";
import { heroClarificationAnswers as A } from "@/data/synthetic/hero";
import { clarifiedHeroProfile, extraction, field, heroInput, msg, profileFrom } from "../helpers";

const constraintsOf = (p = clarifiedHeroProfile()) => interpretations(p)[0].constraints;
const check = (x: EvaluatedStructure, id: string) => [...x.buyerChecks, ...x.sellerChecks].filter((c) => c.id === id);

describe("full template enumeration", () => {
  it("evaluates every template and every parameter combination with no pre-filtering", () => {
    const input = heroInput();
    const t = input.templates;
    const expected =
      t.split_payment.plans.length +
      t.phased_scope.phase1Scopes.length * t.phased_scope.plans.length +
      t.deferred_start.startDates.length * t.deferred_start.plans.length +
      t.shorter_commitment.terms.reduce((a, x) => a + x.plans.length, 0);
    const r = enumerateAndEvaluate(constraintsOf(), input);
    expect(r.structures).toHaveLength(expected);
    expect(r.templatesEvaluated).toEqual(["split_payment", "phased_scope", "deferred_start", "shorter_commitment"]);
    expect(r.feasible.length + r.rejected.length + r.needsInformation.length).toBe(expected);
  });

  it("declares no feasible deal only after enumerating every template", () => {
    const m = msg("Only ₹5K left this quarter; new budget in April; must start before December");
    const p0 = profileFrom(
      extraction([
        field("budget_now_amount", "₹5K", "Only ₹5K left this quarter"),
        field("budget_now_period", "this quarter", "Only ₹5K left this quarter"),
        field("next_budget_date", "April", "new budget in April"),
        field("latest_start", "December", "must start before December"),
      ]),
      [m],
    );
    const p = applyClarificationAnswer(p0, "amountsIncludeGst", "yes", A.gst);
    const e = evaluateDeal(p, heroInput());
    expect(e.state).toBe("no_feasible_deal");
    expect(e.result!.templatesEvaluated).toHaveLength(4);
    expect(e.result!.structures.length).toBe(enumerateStructures(heroInput().templates, heroInput().packages, 1800).length);
    expect(e.result!.structures.every((s) => !s.approvable)).toBe(true);
  });
});

describe("buyer approval limit is a requirement, not a prohibition", () => {
  it("keeps structures above a per-contract limit feasible with requires_approval", () => {
    const r = enumerateAndEvaluate(constraintsOf(), heroInput());
    const above = r.feasible.filter((x) => x.approval === "requires_approval");
    expect(above.length).toBeGreaterThan(0);
    for (const x of above) expect(check(x, "buyer_approval")[0]).toMatchObject({ status: "requires_approval", code: "ABOVE_APPROVAL_LIMIT" });
  });

  it("ranks requires_approval structures below within_limit ones, even if an external ranking says otherwise", () => {
    const r = enumerateAndEvaluate(constraintsOf(), heroInput());
    const firstApproval = r.feasible.findIndex((x) => x.approval === "requires_approval");
    expect(r.feasible.slice(firstApproval).every((x) => x.approval === "requires_approval")).toBe(true);
    const reversed = enforceApprovalOrder([...r.feasible].reverse().map((x) => x.structure.id), r.feasible);
    expect(reversed[0].approval).toBe("within_limit");
    expect(reversed.at(-1)!.approval).toBe("requires_approval");
  });

  it("never implies a split purchase bypasses approval", () => {
    const r = enumerateAndEvaluate(constraintsOf(), heroInput());
    for (const x of r.structures.filter((s) => s.structure.scopeKind === "full")) {
      // Every full-scope structure is measured on the whole contract, however it is split into payments.
      expect(check(x, "buyer_approval")[0].status).toBe("requires_approval");
    }
    for (const x of r.structures.filter((s) => s.structure.scopeKind === "phase_1")) {
      // A phase contracts only its own scope, carries no later phase, and needs buyer authority confirmation.
      expect(x.structure.excludedPackageIds).toContain("social-media");
      expect(x.structure.requirements).toContain("buyer_confirms_authority_for_phase_scope");
      expect(x.structure.label).not.toMatch(/phase 2|bypass|avoid approval/i);
    }
  });

  it("applies a per-payment limit to the largest payment", () => {
    const p = applyClarificationAnswer(applyClarificationAnswer(profileFrom(), "amountsIncludeGst", "yes", A.gst), "approvalScope", "per_payment", A.approvalScope);
    const r = enumerateAndEvaluate(constraintsOf(p), heroInput());
    const may = r.structures.find((x) => x.structure.id === "deferred_start:start=2027-05-01,plan=monthly_12")!;
    expect(may.approval).toBe("within_limit");
  });
});

describe("buyer and seller policy enforcement", () => {
  const variant = (mutate: (i: ReturnType<typeof heroInput>) => void) => {
    const i = heroInput();
    mutate(i);
    return enumerateAndEvaluate(constraintsOf(), i);
  };
  const byId = (r: ReturnType<typeof enumerateAndEvaluate>, id: string) => r.structures.find((x) => x.structure.id === id)!;
  const P1 = "phased_scope:scope=web-search-report-3m,plan=two_monthly";

  it("contribution floor", () => {
    const r = variant((i) => (i.merchant.policy.contributionFloor = { minPercentBps: 6000, minPaise: null, combine: "both" }));
    expect(check(byId(r, P1), "seller_contribution")[0].code).toBe("CONTRIBUTION_BELOW_FLOOR");
    expect(byId(r, P1).verdict).toBe("rejected");
  });
  it("contribution floor in rupees, combined with either/both", () => {
    const either = variant((i) => (i.merchant.policy.contributionFloor = { minPercentBps: 6000, minPaise: rupees(10_000), combine: "either" }));
    expect(check(byId(either, P1), "seller_contribution")[0].status).toBe("pass");
    const both = variant((i) => (i.merchant.policy.contributionFloor = { minPercentBps: 3500, minPaise: rupees(25_000), combine: "both" }));
    expect(check(byId(both, P1), "seller_contribution")[0].status).toBe("fail");
  });
  it("cash-at-risk limit", () => {
    const r = variant((i) => (i.merchant.policy.cashAtRiskLimitPaise = 0));
    const may = byId(r, "deferred_start:start=2027-05-01,plan=monthly_12");
    expect(check(may, "seller_cash_at_risk")[0]).toMatchObject({ status: "fail", facts: { peakFundingPaise: rupees(5_750) } });
  });
  it("maximum tenure", () => {
    const r = variant((i) => (i.merchant.policy.maxTenureMonths = 6));
    expect(check(byId(r, "split_payment:plan=deposit_30"), "max_tenure")[0]).toMatchObject({ status: "fail", facts: { tenureMonths: 12 } });
  });
  it("smallest instalment", () => {
    const r = variant((i) => (i.merchant.policy.smallestInstalmentPaise = rupees(20_000)));
    expect(check(byId(r, P1), "smallest_instalment")[0].status).toBe("fail");
  });
  it("discount limit", () => {
    const r = variant((i) => (i.templates.discountsBps = [0, 1000]));
    const discounted = r.structures.filter((x) => x.structure.discountBps === 1000);
    expect(discounted.length).toBe(r.structures.length / 2);
    for (const x of discounted) expect(check(x, "discount_limit")[0].status).toBe("fail");
  });
  it("scope rules: a phase without independent value and non-removable packages", () => {
    const r = variant((i) => {
      i.templates.phased_scope.phase1Scopes.push({ id: "report-only", label: "Reporting only", items: [{ packageId: "monthly-reporting", months: 3 }] });
      i.packages.find((p) => p.id === "social-media")!.removable = false;
    });
    expect(check(byId(r, "phased_scope:scope=report-only,plan=upfront"), "scope_rules")[0].code).toBe("SCOPE_PACKAGE_NOT_REMOVABLE");
    const r2 = variant((i) => i.templates.phased_scope.phase1Scopes.push({ id: "report-only", label: "Reporting only", items: [{ packageId: "monthly-reporting", months: 3 }] }));
    expect(check(byId(r2, "phased_scope:scope=report-only,plan=upfront"), "scope_rules")[0].code).toBe("SCOPE_NO_INDEPENDENT_VALUE");
  });
  it("buyer budget and timing", () => {
    const r = variant(() => {});
    expect(check(byId(r, "split_payment:plan=two_equal"), "buyer_budget")[0].code).toBe("BUDGET_EXCEEDS_CURRENT_PERIOD");
    expect(check(byId(r, "split_payment:plan=quarterly_4"), "buyer_timing")[0]).toMatchObject({ code: "PAYMENT_BEFORE_NEXT_BUDGET", lineIds: ["pay-2"] });
  });
  it("buyer latest start (deadline month semantics)", () => {
    const m = msg("Only ₹50K left this quarter incl GST; must start before January");
    const p = profileFrom(
      extraction([
        field("budget_now_amount", "₹50K", "Only ₹50K left this quarter"),
        field("budget_now_period", "this quarter", "Only ₹50K left this quarter"),
        field("amounts_include_gst", "incl GST", "Only ₹50K left this quarter incl GST"),
        field("latest_start", "January", "must start before January"),
      ]),
      [m],
    );
    expect(p.amountsIncludeGst.status).toBe("stated");
    const r = enumerateAndEvaluate(constraintsOf(p), heroInput());
    expect(check(byId(r, "deferred_start:start=2027-01-01,plan=monthly_12"), "buyer_timing").map((c) => c.code)).toContain("START_DAY_UNKNOWN_IN_DEADLINE_MONTH");
    expect(check(byId(r, "deferred_start:start=2027-05-01,plan=monthly_12"), "buyer_timing").map((c) => c.code)).toContain("START_AFTER_LATEST_START");
  });
});

describe("the four failure states are distinct", () => {
  const base = (text: string, fields: RawExtraction["fields"], extra: Partial<RawExtraction> = {}) => profileFrom(extraction(fields, extra), [msg(text)]);

  it("ambiguous: decision-relevant ambiguity asks a question", () => {
    expect(evaluateDeal(profileFrom(), heroInput()).state).toBe("ambiguous");
  });
  it("insufficient information: required budget absent", () => {
    const p = base("Can we do this in parts?", []);
    expect(evaluateDeal(p, heroInput())).toMatchObject({ state: "insufficient_information", missingRequired: ["budgetNow"] });
  });
  it("outside supported templates: code confirms the request cannot be represented", () => {
    const text = "Only ₹50K left this quarter. Could you take a revenue share instead?";
    const p = base(text, [field("budget_now_amount", "₹50K", "Only ₹50K left this quarter"), field("budget_now_period", "this quarter", "Only ₹50K left this quarter")], {
      outsideTemplates: [{ rawText: "revenue share", evidenceQuote: "Could you take a revenue share instead?", messageId: "m1", kind: "revenue_share" }],
    });
    const e = evaluateDeal(p, heroInput());
    expect(e.state).toBe("outside_templates");
    expect(e.outsideTemplates[0]).toMatchObject({ representable: false, kind: "revenue_share" });
  });
  it("an AI 'outside' flag for a representable request does not block the deal", () => {
    const text = "Only ₹50K left this quarter incl GST. Could we split it?";
    const p = base(text, [field("budget_now_amount", "₹50K", "Only ₹50K left this quarter"), field("budget_now_period", "this quarter", "Only ₹50K left this quarter"), field("amounts_include_gst", "incl GST", "Only ₹50K left this quarter incl GST")], {
      outsideTemplates: [{ rawText: "split it", evidenceQuote: "Could we split it?", messageId: "m1", kind: "split_payment" }],
    });
    expect(evaluateDeal(p, heroInput()).state).not.toBe("outside_templates");
  });
  it("no feasible deal: only after full enumeration (see enumeration test) with blocking reasons", () => {
    const text = "Only ₹5K left this quarter incl GST; new budget in April; must start before December";
    const p = base(text, [field("budget_now_amount", "₹5K", "Only ₹5K left this quarter"), field("budget_now_period", "this quarter", "Only ₹5K left this quarter"), field("amounts_include_gst", "incl GST", "Only ₹5K left this quarter incl GST"), field("next_budget_date", "April", "new budget in April"), field("latest_start", "December", "must start before December")]);
    expect(p.amountsIncludeGst).toMatchObject({ status: "stated", covers: ["budgetNow"] });
    const e = evaluateDeal(p, heroInput());
    expect(e.state).toBe("no_feasible_deal");
    expect(e.result!.rejected.every((x) => [...x.buyerChecks, ...x.sellerChecks].some((c) => c.status === "fail"))).toBe(true);
  });
  it("structures that are only undecidable produce insufficient information, not no-feasible", () => {
    const text = "Nothing left this quarter. ₹0 now incl GST, new budget in May";
    const i = heroInput();
    i.templates.deferred_start.startDates = ["2027-05-01"];
    i.templates.split_payment.enabled = false;
    i.templates.phased_scope.enabled = false;
    i.templates.shorter_commitment.enabled = false;
    const p = base(text, [field("budget_now_amount", "₹0", "₹0 now"), field("budget_now_period", "this quarter", "Nothing left this quarter"), field("amounts_include_gst", "incl GST", "₹0 now incl GST"), field("next_budget_date", "May", "new budget in May")]);
    expect(p.amountsIncludeGst.status).toBe("stated");
    const e = evaluateDeal(p, i);
    expect(e.state).toBe("insufficient_information");
    expect(e.result!.needsInformation[0].buyerChecks.map((c) => c.code)).toContain("PAYMENT_DAY_UNKNOWN_IN_BUDGET_MONTH");
  });
});
