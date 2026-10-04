import { runConstruct } from "@/ai/orchestrator";
import type { RecordedAnswer } from "@/ai/run-record";
import { FixedClock } from "@/domain/clock";
import { heroDeal, heroRecordedAnswers } from "@/data/synthetic/hero-run";
import { syntheticHeroProvider } from "@/tests/ai/helpers";
import {
  answersMatchRecorded,
  canonicalAnswers,
  deriveBranchOutcome,
  type DecisionBranch,
} from "@/lib/decision-branch";
import { describe, expect, it } from "vitest";

const changedAnswers = (gst: "yes" | "no", approval: "per_contract" | "per_payment"): RecordedAnswer[] => [
  { ...heroRecordedAnswers[0], value: gst, answerText: gst === "yes" ? "Yes, both include GST." : "No, both exclude GST." },
  {
    ...heroRecordedAnswers[1],
    value: approval,
    answerText: approval === "per_contract" ? "₹60,000 is per contract." : "₹60,000 is per payment.",
  },
];

async function initialOutcome() {
  return runConstruct({
    provider: syntheticHeroProvider(),
    kind: "synthetic_replay",
    runId: "run-branch-parent",
    clock: new FixedClock(),
    deal: heroDeal(),
  });
}

function branch(answers: RecordedAnswer[]): DecisionBranch {
  return {
    schema: "adaptive-deals.decision-branch.v1",
    branchId: "branch-test",
    parentRunId: "run-branch-parent",
    createdAt: "2026-10-01T09:30:00+05:30",
    answers,
    reason: "changed_clarification_answers",
    explanationSource: "code_fallback",
  };
}

describe("decision branches", () => {
  it("compares the complete answer evidence canonically without depending on array order", () => {
    const source = { ...({} as Parameters<typeof answersMatchRecorded>[0]), inputs: { answers: heroRecordedAnswers } };

    expect(canonicalAnswers([...heroRecordedAnswers].reverse())).toBe(canonicalAnswers(heroRecordedAnswers));
    expect(answersMatchRecorded(source, [...heroRecordedAnswers].reverse())).toBe(true);
    expect(answersMatchRecorded(source, [{ ...heroRecordedAnswers[0], answeredAt: "2026-10-01T09:21:00+05:30" }, heroRecordedAnswers[1]])).toBe(false);
    expect(answersMatchRecorded(source, [{ ...heroRecordedAnswers[0], confirmedByBuyerVia: "email" }, heroRecordedAnswers[1]])).toBe(false);
    expect(answersMatchRecorded(source, [{ ...heroRecordedAnswers[0], answerText: "Yes." }, heroRecordedAnswers[1]])).toBe(false);
  });

  it.each([
    ["yes", "per_contract"],
    ["yes", "per_payment"],
    ["no", "per_contract"],
    ["no", "per_payment"],
  ] as const)("derives a complete engine result for GST %s and approval %s", async (gst, approval) => {
    const initial = await initialOutcome();
    const out = deriveBranchOutcome({ initial, branch: branch(changedAnswers(gst, approval)), deal: heroDeal() });

    expect(out.record).toBe(initial.record);
    expect(out.profile.amountsIncludeGst.value).toBe(gst);
    expect(out.profile.approvalScope.value).toBe(approval);
    expect(out.evaluation.state).toBe("options_ready");
    expect(out.evaluation.result?.structures).toHaveLength(15);
    expect(out.evaluation.result?.feasible.length).toBeGreaterThan(0);
    expect(out.evaluation.result?.feasible.every((option) => option.structure.payments.every((payment) => payment.totalPaise > 0))).toBe(true);
    expect(out.explanation?.source).toEqual({ ranking: "code", text: "code_fallback" });
    expect(out.explanation?.order).toEqual(out.evaluation.result?.feasible.map((option) => option.structure.id));
  });

  it("rejects an answer value that the clarification question does not support", async () => {
    const initial = await initialOutcome();
    const bad = changedAnswers("yes", "per_contract");
    bad[0] = { ...bad[0], value: "maybe" };

    expect(() => deriveBranchOutcome({ initial, branch: branch(bad), deal: heroDeal() })).toThrow(/GST answer must be yes or no/);
  });
});
