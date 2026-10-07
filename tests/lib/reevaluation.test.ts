import { beforeEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { demoCase } from "@/data/synthetic/cases";

process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-reevaluation-"));

let service: typeof import("@/lib/service");
let economics: typeof import("@/lib/economics-store");
let context: typeof import("@/lib/deal-context");

beforeAll(async () => {
  service = await import("@/lib/service");
  economics = await import("@/lib/economics-store");
  context = await import("@/lib/deal-context");
});

beforeEach(async () => {
  await economics.resetEconomicsStore();
  await service.startCase("reduced-scope");
});

async function activateVersion(change: (content: Awaited<ReturnType<typeof economics.activeEconomics>>) => void) {
  const current = structuredClone(await economics.activeEconomics());
  change(current);
  await economics.saveEconomicsDraft({
    services: current.services,
    guardrails: current.guardrails,
    discountLadderBps: current.discountLadderBps,
    fixed: current.fixed,
  });
  return economics.activateEconomicsDraft("Merchant", "2026-10-07T10:00:00+05:30");
}

async function answerHeroQuestions() {
  await service.recordAnswers(demoCase("reduced-scope")!.expected.recordedAnswers.map((answer) => ({
    questionId: answer.questionId,
    value: answer.value,
    answerText: answer.answerText,
    confirmedByBuyerVia: answer.confirmedByBuyerVia,
    answeredAt: answer.answeredAt,
  })));
}

describe("explicit re-evaluation", () => {
  it("treats a price-only account version as irrelevant to an existing deal and never mutates during preview", async () => {
    const version = await activateVersion((content) => { content.services[0].listPricePaise += 10_000; });
    const before = structuredClone(await service.getState());

    expect(await service.reevaluationAvailable(before)).toBe(false);
    expect(await service.previewReevaluation(version.version)).toMatchObject({
      fromVersion: 1,
      toVersion: version.version,
      blocked: [],
      changesInputs: false,
      inputChanges: [],
      pricesNote: "Service prices are unchanged for this deal.",
    });
    expect(await service.getState()).toEqual(before);
  });

  it("shows an exact cost change, never a price change, and keeps every baseline price after applying it", async () => {
    const version = await activateVersion((content) => { content.services[0].directCostPaise += 10_000; });
    const before = structuredClone(await service.getState());
    const preview = await service.previewReevaluation(version.version);

    expect(preview.changesInputs).toBe(true);
    expect(preview.inputChanges).toEqual([{
      field: "packages[0].directCostPaise",
      from: "1200000",
      to: "1210000",
    }]);
    expect(preview.inputChanges.some((change) => /listPrice|price/i.test(change.field))).toBe(false);
    expect(await service.getState()).toEqual(before);

    const updated = await service.reevaluateDeal(version.version);
    const deal = context.dealContextFor(updated, version);
    expect(deal.packages.map((item) => item.listPricePaise)).toEqual(updated.baseline.servicePrices.map((item) => item.listPricePaise));
    expect(updated.economics.pinned.version).toBe(version.version);
  });

  it("judges 'the recommendation changes' by the deal's own strategy, not by one fixed order", async () => {
    await answerHeroQuestions();
    // A 3-month maximum payment duration removes both full-scope offers and nothing else.
    const version = await activateVersion((content) => { content.guardrails.maxTenureMonths = 3; });
    const protect = await service.previewReevaluation(version.version);
    expect(protect.becomesInfeasible.length).toBe(2);
    expect(protect.recommendationChanges).toBe(false);

    await service.setStrategy("preserve_scope");
    const preserve = await service.previewReevaluation(version.version);
    expect(preserve.becomesInfeasible).toEqual(protect.becomesInfeasible);
    expect(preserve.recommendationChanges).toBe(true);
  });

  it("blocks a version whose delivery dependencies are outside the original deal", async () => {
    const version = await activateVersion((content) => {
      content.services.push({ ...structuredClone(content.services[0]), id: "new-service", name: "New service", dependsOnAny: [] });
      content.services[0].dependsOnAny = ["new-service"];
    });
    const before = structuredClone(await service.getState());
    const preview = await service.previewReevaluation(version.version);

    expect(preview.blocked).toEqual([expect.stringMatching(/now depends on New service, which was not part of this deal/i)]);
    expect(preview.becomesFeasible).toEqual([]);
    expect(preview.becomesInfeasible).toEqual([]);
    expect(preview.recommendationChanges).toBe(false);
    await expect(service.reevaluateDeal(version.version)).rejects.toThrow(preview.blocked[0]);
    expect(await service.getState()).toEqual(before);
  });

  it("refuses re-evaluation after a proposal has been sent", async () => {
    await answerHeroQuestions();
    const draft = await service.reviewBuyerProposal();
    await service.approveDraft(draft.version, draft.termsHash);
    await service.sendProposal(draft.version);
    const version = await activateVersion((content) => { content.services[0].directCostPaise += 10_000; });

    await expect(service.reevaluateDeal(version.version)).rejects.toThrow("This deal's sent or accepted version keeps the economics it was made with");
  });
});
