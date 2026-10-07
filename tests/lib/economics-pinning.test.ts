import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { termsHash } from "@/domain/agreement";
import { demoCase } from "@/data/synthetic/cases";

process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-pinning-"));
let service: typeof import("@/lib/service");
beforeAll(async () => {
  service = await import("@/lib/service");
});

describe("economics provenance stays outside contractual terms", () => {
  it("pins the economics behind a draft without changing its terms hash", async () => {
    await service.startCase("reduced-scope");
    await service.recordAnswers(demoCase("reduced-scope")!.expected.recordedAnswers.map((answer) => ({
      questionId: answer.questionId,
      value: answer.value,
      answerText: answer.answerText,
      confirmedByBuyerVia: answer.confirmedByBuyerVia,
      answeredAt: answer.answeredAt,
    })));
    const draft = await service.reviewBuyerProposal();
    const state = await service.getState();
    expect(draft.economics).toEqual({
      version: state.economics.pinned.version,
      effectiveHash: state.economics.effectiveHash,
      strategy: state.economics.strategy,
    });
    expect(draft.termsHash).toBe(termsHash(draft.terms));
    expect(JSON.stringify(draft.terms)).not.toMatch(/economics|effectiveHash|strategy/);
  });
});
