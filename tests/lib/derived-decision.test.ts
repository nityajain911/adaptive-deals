import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { demoCase } from "@/data/synthetic/cases";

process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-derived-"));
let service: typeof import("@/lib/service");
let economics: typeof import("@/lib/economics-store");
let context: typeof import("@/lib/deal-context");
let dealEconomics: typeof import("@/lib/deal-economics");

beforeAll(async () => {
  service = await import("@/lib/service");
  economics = await import("@/lib/economics-store");
  context = await import("@/lib/deal-context");
  dealEconomics = await import("@/lib/deal-economics");
});

async function changedCostVersion() {
  const v1 = await economics.activeEconomics();
  const content = {
    services: structuredClone(v1.services),
    guardrails: structuredClone(v1.guardrails),
    discountLadderBps: [...v1.discountLadderBps],
    fixed: structuredClone(v1.fixed),
  };
  content.services[0].directCostPaise += 10_000;
  await economics.saveEconomicsDraft(content);
  return economics.activateEconomicsDraft("Merchant", "2026-10-07T10:00:00+05:30");
}

describe("recorded output is valid only for its recorded economics", () => {
  it("switches to a code-derived decision without changing the run, and restores the recording under version 1", async () => {
    await service.startCase("reduced-scope");
    const state = await service.recordAnswers(demoCase("reduced-scope")!.expected.recordedAnswers.map((answer) => ({
      questionId: answer.questionId,
      value: answer.value,
      answerText: answer.answerText,
      confirmedByBuyerVia: answer.confirmedByBuyerVia,
      answeredAt: answer.answeredAt,
    })));
    const recorded = await service.currentOutcome(state);
    expect(recorded.explanation?.source.ranking).toBe("ai");
    expect(state.decisionBranch).toBeNull();
    const runBefore = structuredClone(state.run.record);

    const v2 = await changedCostVersion();
    const deal2 = context.dealContextFor(state, v2);
    state.economics = {
      ...state.economics,
      pinned: { version: v2.version, hash: v2.hash },
      effectiveHash: dealEconomics.effectiveHashOf(deal2),
    };
    service.syncEconomicsBranch(state);
    const derived = await service.currentOutcome(state);
    expect(derived.explanation?.source).toEqual({ ranking: "code", text: "code_fallback" });
    expect(state.run.record).toEqual(runBefore);
    expect(state.decisionBranch?.economics?.version).toBe(v2.version);
    const beforeById = new Map(recorded.evaluation.result!.structures.map((x) => [x.structure.id, x]));
    expect(derived.evaluation.result!.structures.some((x) => x.economics.netContributionPaise !== beforeById.get(x.structure.id)?.economics.netContributionPaise)).toBe(true);

    const v1 = (await economics.economicsVersion(1))!;
    state.economics = {
      ...state.economics,
      pinned: { version: v1.version, hash: v1.hash },
      effectiveHash: dealEconomics.effectiveHashOf(context.dealContextFor(state, v1)),
    };
    service.syncEconomicsBranch(state);
    expect(state.decisionBranch).toBeNull();
    expect((await service.currentOutcome(state)).explanation?.source.ranking).toBe("ai");
  });

  it("keeps a merchant scope branch while adding changed economics", async () => {
    const state = await service.startCase("preserve-scope");
    state.decisionBranch = {
      schema: "adaptive-deals.decision-branch.v2",
      branchId: "scope",
      parentRunId: state.run.record.runId,
      createdAt: "2026-10-07T10:00:00+05:30",
      answers: [],
      reason: "merchant_scope_confirmation",
      answersChanged: false,
      scope: {
        kind: "required_services",
        confirmedAt: "2026-10-07T10:00:00+05:30",
        by: "Merchant",
        packageIds: ["website-fixes"],
        sources: [{ rawText: "complete annual package", evidenceQuote: "complete annual package", messageId: "preserve-2", extractInputHash: "x" }],
      },
      explanationSource: "code_fallback",
    };
    const v2 = await changedCostVersion();
    state.economics = { ...state.economics, pinned: { version: v2.version, hash: v2.hash }, effectiveHash: dealEconomics.effectiveHashOf(context.dealContextFor(state, v2)) };
    service.syncEconomicsBranch(state);
    expect(state.decisionBranch?.reason).toBe("merchant_scope_confirmation");
    expect(state.decisionBranch?.economics?.version).toBe(v2.version);
  });
});
