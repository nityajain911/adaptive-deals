import { describe, expect, it } from "vitest";
import { loadCommercialMemoryEvaluation, runLexicalCommercialMemoryEvaluation } from "@/commercial-memory/evaluation";

describe("frozen Commercial Memory evaluation", () => {
  it("matches its pre-provider case hash and reports count-based lexical results", () => {
    const frozen = loadCommercialMemoryEvaluation();
    expect(frozen.cases).toHaveLength(15);
    expect(frozen.hash).toBe(frozen.freeze.caseSetSha256);
    const report = runLexicalCommercialMemoryEvaluation(frozen.cases);
    expect(report).toMatchObject({
      cases: 15,
      expectedSourceTop3: { correct: 13, total: 13 },
      expectedSourceTop5: { correct: 13, total: 13 },
      abstentions: { correct: 2, total: 2 },
      crossMerchantChunks: 0,
      supersededSourcesUsed: 0,
    });
    expect(report.validCitations.correct).toBe(report.validCitations.total);
  });
});
