import { describe, expect, it } from "vitest";
import { BUDGET, emptyLedger, haltReason, remaining, spend } from "@/evaluation-assist/runner/budget";

describe("the approved call budget", () => {
  it("is the plan's numbers: per-task allowances add up to the cap", () => {
    expect(Object.values(BUDGET.perTask).reduce((a, b) => a + b, 0)).toBe(BUDGET.cap);
    expect(BUDGET.cap).toBe(581);
  });
  it("counts each call and refuses to pass a task's allowance", () => {
    const ledger = emptyLedger();
    for (let i = 0; i < BUDGET.perTask.strategy_narrative; i++) spend(ledger, "strategy_narrative");
    expect(remaining(ledger, "strategy_narrative")).toBe(0);
    expect(() => spend(ledger, "strategy_narrative")).toThrow(/budget exhausted/);
    expect(remaining(ledger, "profile_extract")).toBe(BUDGET.perTask.profile_extract);
  });
  it("never lets the total pass the cap", () => {
    const ledger = emptyLedger();
    ledger.total = BUDGET.cap;
    expect(remaining(ledger, "negotiation_message")).toBe(0);
  });
});

describe("stop rules", () => {
  it("halts on two consecutive auth or quota errors", () => {
    expect(haltReason({ calls: 3, consecutiveAuthOrQuota: 2, avgTokensPerCall: 1000, estimatedTokensPerCall: 1600 })).toMatch(/consecutive/);
    expect(haltReason({ calls: 3, consecutiveAuthOrQuota: 1, avgTokensPerCall: 1000, estimatedTokensPerCall: 1600 })).toBeNull();
  });
  it("halts when measured tokens exceed the estimate by more than 50% after 10 calls, not before", () => {
    expect(haltReason({ calls: 10, consecutiveAuthOrQuota: 0, avgTokensPerCall: 2500, estimatedTokensPerCall: 1600 })).toMatch(/50%/);
    expect(haltReason({ calls: 9, consecutiveAuthOrQuota: 0, avgTokensPerCall: 2500, estimatedTokensPerCall: 1600 })).toBeNull();
    expect(haltReason({ calls: 10, consecutiveAuthOrQuota: 0, avgTokensPerCall: 2300, estimatedTokensPerCall: 1600 })).toBeNull();
  });
});
