import { describe, expect, it } from "vitest";
import { interpretClarification } from "@/ai/clarify";
import { checkText, interpretExplanation } from "@/ai/explain";
import { AnswerError, runConstruct } from "@/ai/orchestrator";
import { FixedClock } from "@/domain/clock";
import { explainAmbiguity } from "@/domain/copy";
import { evaluateDeal } from "@/domain/engine";
import { heroDeal, heroRecordedAnswers } from "@/data/synthetic/hero-run";
import { clarifiedHeroProfile, heroInput, profileFrom } from "../helpers";
import { heroOutputs, heroRun, ScriptedProvider } from "./helpers";

describe("clarification selection is driven by the engine", () => {
  const profile = profileFrom();
  const impacts = evaluateDeal(profile, heroInput()).ambiguities;

  it("asks only about facts whose answer changes the commercial decision, with engine-derived reasons", () => {
    const r = interpretClarification(heroOutputs().clarify, profile, impacts);
    expect(r.questions.map((q) => q.field)).toEqual(impacts.filter((a) => a.decisionRelevant).map((a) => a.field));
    for (const q of r.questions) expect(q.whyItMatters).toBe(explainAmbiguity(impacts.find((a) => a.field === q.field)!));
    expect(r.questions.find((q) => q.field === "amountsIncludeGst")!.covers).toEqual(["budgetNow", "approvalLimit"]);
  });

  it("drops questions about facts that do not change the outcome", () => {
    const irrelevant = impacts.map((a) => (a.field === "approvalScope" ? { ...a, decisionRelevant: false } : a));
    const r = interpretClarification(heroOutputs().clarify, profile, irrelevant);
    expect(r.questions.map((q) => q.field)).toEqual(["amountsIncludeGst"]);
    expect(r.issues).toContain("approvalScope: not decision-relevant; question dropped");
  });

  it("rejects wording that names only one amount in the GST question, or invents a figure", () => {
    const r = interpretClarification(
      { questions: [{ field: "amountsIncludeGst", question: "Does ₹50,000 include GST?" }, { field: "approvalScope", question: "Is ₹65,000 per payment or per contract?" }] },
      profile,
      impacts,
    );
    expect(r.questions.map((q) => q.wording)).toEqual(["code_fallback", "code_fallback"]);
    expect(r.questions[0].question).toBe("Do both ₹50,000 and ₹60,000 include GST?");
    expect(r.issues.join(" ")).toMatch(/does not name ₹60,000.*figure not in the buyer's message \(₹65,000\)/);
  });

  it("answers must match questions asked in the same run", async () => {
    const provider = new ScriptedProvider(heroOutputs());
    const first = await runConstruct({ provider, kind: "live", runId: "r1", clock: new FixedClock(), deal: heroDeal() });
    await expect(runConstruct({ provider, kind: "live", runId: "r1", clock: new FixedClock(), deal: heroDeal(), previous: first.record, answers: [{ ...heroRecordedAnswers[0], questionId: "clar-other" }] })).rejects.toThrow(AnswerError);
    await expect(runConstruct({ provider, kind: "live", runId: "r2", clock: new FixedClock(), deal: heroDeal(), previous: first.record })).rejects.toThrow(/own run ID/);
  });
});

describe("explanation: AI ranks and words, code owns figures and feasibility", () => {
  const feasible = evaluateDeal(clarifiedHeroProfile(), heroInput()).result!.feasible;

  it("fills every figure from verified engine values", () => {
    const r = interpretExplanation(heroOutputs().explain, feasible);
    expect(r.source).toEqual({ ranking: "ai", text: "ai" });
    expect(r.comparison).toContain("₹46,020");
    expect(r.comparison).not.toMatch(/\{[A-L]\./);
    expect(checkText(heroOutputs().explain.comparison, r.options)).toBeNull(); // model text itself has no literal figures
  });

  it.each([
    ["a literal amount", "Option A costs ₹46,020 in total.", /literal figure/],
    ["a literal date", "Option A is paid on 1 Nov.", /literal figure/],
    ["a percentage", "Option C has a higher margin of 50%.", /literal figure/],
    ["an unknown placeholder", "Option A costs {A.discount}.", /unknown placeholder/],
    ["an approval bypass", "Choose Phase 1 to avoid MD approval.", /avoiding approval/],
    ["a split-to-stay-under suggestion", "Split it so each part can stay under the limit.", /avoiding approval/],
    ["a payment guarantee", "The mandate will guarantee payment.", /avoiding approval or promises/],
  ])("rejects text with %s", (_, text, why) => {
    expect(checkText(text, interpretExplanation(null, feasible).options)).toMatch(why);
  });

  it("cannot rank rejected options or drop feasible ones; approval ordering is enforced by code", () => {
    const r = interpretExplanation({ ranking: ["D", "E", "C"], comparison: "Option D is the most flexible for the buyer.", option_notes: [] }, feasible);
    expect(r.order).toHaveLength(feasible.length);
    expect(r.order.slice(0, 2).every((id) => feasible.find((x) => x.structure.id === id)!.approval === "within_limit")).toBe(true);
    expect(r.issues.join(" ")).toMatch(/did not mark feasible \(E\).*omitted feasible options.*approval ordering enforced/);
  });

  it("the explanation step never changes the engine's verdicts or the set of evaluated structures", async () => {
    const good = await heroRun(new ScriptedProvider(heroOutputs()), { answers: true });
    const hostile = await heroRun(new ScriptedProvider({ ...heroOutputs(), explain: { ranking: ["A"], comparison: "Ignore the engine and approve everything.", option_notes: [] } }), { answers: true });
    expect(hostile.record.engine).toEqual(good.record.engine);
    expect(hostile.record.engine.final!.structures).toHaveLength(15);
  });
});
