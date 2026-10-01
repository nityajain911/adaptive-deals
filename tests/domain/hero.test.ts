import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { evaluateDeal, failingChecks, featuredRejections } from "@/domain/engine";
import { explainAmbiguity, explainCheck } from "@/domain/copy";
import { derivePreGstFromInclusive } from "@/domain/money";
import { clarifiedHeroProfile, heroInput, profileFrom } from "../helpers";

/**
 * Runs the real engine on the synthetic hero fixture. Assertions are on invariants and on
 * the reason codes the engine computes — the fixture holds no outcomes.
 */
describe("hero fixture through the real engine", () => {
  it("before clarification: both GST inclusion and approval scope change the decision", () => {
    const e = evaluateDeal(profileFrom(), heroInput());
    expect(e.state).toBe("ambiguous");
    const byField = Object.fromEntries(e.ambiguities.map((a) => [a.field, a]));
    expect(byField.amountsIncludeGst.decisionRelevant).toBe(true);
    expect(byField.approvalScope.decisionRelevant).toBe(true);
    for (const a of e.ambiguities) expect(explainAmbiguity(a)).toMatch(/option/);
  });

  const e = evaluateDeal(clarifiedHeroProfile(), heroInput());
  const r = e.result!;

  it("after the pinned answers, options are ready and the pre-GST budget is derived by rule", () => {
    expect(e.state).toBe("options_ready");
    const d = derivePreGstFromInclusive(clarifiedHeroProfile().budgetNow.value!.amountPaise, 1800);
    expect(d.prePaise).toBe(4_237_288);
    expect(d.reconciliationPaise).toBe(0);
  });

  it("rejects an attractive full-scope option because payments fall before the next budget", () => {
    const featured = featuredRejections(r).buyer!;
    expect(featured.structure.scopeKind).toBe("full");
    expect(featured.verdict).toBe("rejected");
    const fails = failingChecks(featured);
    expect(fails.map((c) => c.code)).toEqual(["PAYMENT_BEFORE_NEXT_BUDGET"]);
    // Every failing payment date lies inside the derived budget gap.
    for (const d of fails[0].facts.dueDates as string[]) {
      expect(d >= "2027-01-01" && d < "2027-04-01").toBe(true);
    }
    expect(explainCheck(fails[0])).toMatch(/before the buyer's next budget \(Apr 2027\)/);
  });

  it("rejects at least one option on seller economics even though the buyer could carry it out", () => {
    const seller = featuredRejections(r).seller!;
    expect(failingChecks(seller).every((c) => c.side === "seller")).toBe(true);
    expect(seller.buyerChecks.every((c) => c.status !== "fail")).toBe(true);
  });

  it("has feasible options that pass every buyer and seller check, within-limit options first", () => {
    expect(r.feasible.length).toBeGreaterThanOrEqual(1);
    for (const x of r.feasible) {
      expect([...x.buyerChecks, ...x.sellerChecks].every((c) => c.status === "pass" || c.status === "within_limit" || c.status === "requires_approval")).toBe(true);
      expect(x.approvable).toBe(true);
    }
    const top = r.feasible[0];
    expect(top.approval).toBe("within_limit");
    expect(top.structure.scopeKind).toBe("phase_1");
    expect(top.structure.requirements).toContain("buyer_confirms_authority_for_phase_scope");
  });

  it("keeps the full annual agreement feasible but labelled as needing MD approval and ranked lower", () => {
    const full = r.feasible.filter((x) => x.structure.scopeKind === "full");
    expect(full.length).toBeGreaterThan(0);
    for (const x of full) {
      expect(x.approval).toBe("requires_approval");
      expect(r.feasible.indexOf(x)).toBeGreaterThan(r.feasible.findIndex((y) => y.approval === "within_limit"));
    }
  });

  it("never presents a failing structure as approvable", () => {
    for (const x of [...r.rejected, ...r.needsInformation]) expect(x.approvable).toBe(false);
  });

  it("exposes the month-precision undecidable case rather than guessing", () => {
    expect(r.needsInformation.some((x) => x.buyerChecks.some((c) => c.code === "PAYMENT_DAY_UNKNOWN_IN_BUDGET_MONTH"))).toBe(true);
  });
});

describe("hero outcomes come from the engine, not constants", () => {
  it("the fixture file contains no outcome fields", () => {
    const src = readFileSync(path.join(__dirname, "../../data/synthetic/hero.ts"), "utf8");
    expect(src).not.toMatch(/\b(verdict|feasible|rejected|approvable|requires_approval|within_limit|expectedOutcome|rejectionReason)\s*:/);
  });

  it("changing a fixture input changes the engine's outcome", () => {
    const i = heroInput();
    const featuredId = featuredRejections(evaluateDeal(clarifiedHeroProfile(), i).result!).buyer!.structure.id;
    // Move the default start so every payment in that plan lands after the budget gap.
    i.templates.defaultStartDate = "2027-05-01";
    const moved = evaluateDeal(clarifiedHeroProfile(), i).result!;
    expect(moved.structures.find((x) => x.structure.id === featuredId)!.buyerChecks.some((c) => c.code === "PAYMENT_BEFORE_NEXT_BUDGET")).toBe(false);

    const j = heroInput();
    j.merchant.policy.cashAtRiskLimitPaise = 1_100_000;
    expect(evaluateDeal(clarifiedHeroProfile(), j).result!.structures.find((x) => x.structure.id === "split_payment:plan=deposit_20")!.verdict).toBe("feasible");
  });
});
