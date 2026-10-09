import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { driveTo } from "../helpers/drive";

/**
 * A deal-specific input override changes an assumption before the engine runs, for this deal only.
 * It needs a reason, records whether it tightens or loosens the account's rule, and never touches
 * the account economics or the prices the deal was quoted at.
 */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-overrides-"));
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic";
type Svc = typeof import("@/lib/service");
let svc: Svc;
let store: typeof import("@/lib/economics-store");
let presenter: typeof import("@/lib/presenter-store");
const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
  throw new Error("no network");
});
beforeAll(async () => {
  svc = await import("@/lib/service");
  store = await import("@/lib/economics-store");
  presenter = await import("@/lib/presenter-store");
});
afterAll(() => fetchSpy.mockRestore());

const WEBSITE = "website-fixes";
const REASON = "This client needs extra migration work";

beforeEach(async () => {
  await store.resetEconomicsStore();
  await svc.resetToSeed();
  await presenter.setFailNextSend(false);
  await driveTo(svc, (s) => s.status === "options_ready");
});

const leader = async () => {
  const s = await svc.getState();
  return svc.strategyViewOf(s, await svc.currentOutcome(s)).leader!;
};
const costOverride = (value: number, reason = REASON) => svc.addInputOverride({ field: "direct_cost", packageId: WEBSITE, value, reason });

describe("adding an input override", () => {
  it("moves the figures by exactly the change, and changes no quoted price", async () => {
    const before = (await leader()).economics.netContributionPaise;
    const s = await costOverride(1_500_000);
    const after = (await leader()).economics.netContributionPaise;
    expect(before - after).toBe(300_000); // ₹12,000 → ₹15,000 on a one-time service
    expect(s.baseline.servicePrices.find((p) => p.packageId === WEBSITE)!.listPricePaise).toBe(2_400_000);
    expect(s.baseline.quotedTotalPaise).toBe(14_160_000);
  });

  it("never touches the account economics", async () => {
    const before = structuredClone(await store.getEconomicsStore());
    await costOverride(1_500_000);
    expect(await store.getEconomicsStore()).toEqual(before);
  });

  it("records who, when, why, the account's value, the deal's value, and which way it moves the rule", async () => {
    const s = await costOverride(1_500_000);
    expect(s.economics.overrides).toEqual([
      expect.objectContaining({ field: "direct_cost", packageId: WEBSITE, value: 1_500_000, accountValue: 1_200_000, direction: "tightens", reason: REASON, by: "Merchant (Pinecone Media Works)" }),
    ]);
    expect(s.events.at(-1)).toMatchObject({ kind: "input_override_added", provenance: "merchant" });
  });

  it.each([
    ["cash_exposure", 2_000_000, "loosens"],
    ["cash_exposure", 500_000, "tightens"],
    ["discount_limit", 1000, "loosens"],
  ] as const)("marks a %s of %i as %s the account rule", async (field, value, direction) => {
    const s = await svc.addInputOverride({ field, value, reason: REASON });
    expect(s.economics.overrides.at(-1)!.direction).toBe(direction);
  });

  it("can override the contribution floor as a whole", async () => {
    const s = await svc.addInputOverride({ field: "contribution_floor", value: { minPercentBps: 2000, minPaise: null, combine: "both" }, reason: REASON });
    expect(s.economics.overrides.at(-1)).toMatchObject({ direction: "loosens", accountValue: expect.objectContaining({ minPercentBps: 3500 }) });
  });

  it("changes the deal's effective hash, and so makes an unsent draft stale", async () => {
    const hash = (await svc.getState()).economics.effectiveHash;
    await svc.reviewBuyerProposal();
    expect(await svc.isDraftStale(await svc.getState())).toBe(false);
    const s = await costOverride(1_500_000);
    expect(s.economics.effectiveHash).not.toBe(hash);
    expect(await svc.isDraftStale(s)).toBe(true);
  });

  it("replaces an earlier override of the same input, keeping the earlier one in the log", async () => {
    await costOverride(1_500_000);
    const s = await costOverride(1_700_000, "Scope grew again");
    expect(s.economics.overrides).toHaveLength(1);
    expect(s.economics.overrides[0].value).toBe(1_700_000);
    expect(s.events.filter((e) => e.kind === "input_override_added")).toHaveLength(2);
    expect(s.events.some((e) => e.kind === "input_override_replaced" || /replac/i.test(e.detail ?? ""))).toBe(true);
  });
});

describe("answers the buyer already gave", () => {
  it("still apply when an override makes their question irrelevant to the decision", async () => {
    const before = await svc.getState();
    expect(before.run.record.inputs.answers.map((a) => a.questionId).sort()).toEqual(["clar-approval", "clar-gst"]);
    // A cash limit of ₹0 leaves no feasible offer whatever the answers mean, so no question changes the outcome.
    const s = await svc.addInputOverride({ field: "cash_exposure", value: 0, reason: REASON });
    const out = await svc.currentOutcome(s);
    expect(out.profile.amountsIncludeGst).toMatchObject({ status: "stated", value: "yes" });
    expect(out.profile.approvalScope).toMatchObject({ status: "stated", value: "per_contract" });
    // And removing the override brings the original decision back.
    const restored = await svc.removeInputOverride(s.economics.overrides[0].id);
    expect((await svc.currentOutcome(restored)).evaluation.state).toBe("options_ready");
  });
});

describe("a deal that started under other economics", () => {
  it("keeps a valid record when the buyer's answers match the recording: the cause is the economics, not the answers", async () => {
    const { defaultEconomicsContent } = await import("@/lib/economics-default");
    const draft = defaultEconomicsContent();
    draft.guardrails.cashAtRiskLimitPaise = 2_000_000;
    await store.saveEconomicsDraft(draft);
    await store.activateEconomicsDraft("Merchant (Pinecone Media Works)", "2026-10-06T10:00:00+05:30");
    await svc.resetToSeed();
    await driveTo(svc, (s) => s.status === "options_ready");
    const s = await svc.getState();
    expect(s.reviewRequired).toBeNull();
    // Under these limits the engine needs no answers, so the deal is ready at once and no answer-driven branch exists.
    expect(await svc.progressOf(s)).toMatchObject({ stage: "offer" });
    expect((await svc.currentOutcome(s)).evaluation.state).toBe("options_ready");
    // And the merchant can actually take the next step (this used to fail with "Options are not ready (deal is clarifying)").
    await expect(svc.reviewBuyerProposal()).resolves.toBeTruthy();
  });
});

describe("removing an input override", () => {
  it("restores the original effective hash, and the recorded run's economics", async () => {
    const original = await svc.getState();
    const added = await costOverride(1_500_000);
    expect(svc.economicsMatchRecording(added)).toBe(false);
    const removed = await svc.removeInputOverride(added.economics.overrides[0].id);
    expect(removed.economics.overrides).toEqual([]);
    expect(removed.economics.effectiveHash).toBe(original.economics.effectiveHash);
    expect(svc.economicsMatchRecording(removed)).toBe(true);
    expect(removed.events.at(-1)).toMatchObject({ kind: "input_override_removed", provenance: "merchant" });
  });

  it("refuses an override that does not exist", async () => {
    await expect(svc.removeInputOverride("ovr-nope")).rejects.toThrow(/no such override/i);
  });
});

describe("what an override must be", () => {
  it.each([
    ["no reason", { field: "cash_exposure" as const, value: 500_000, reason: "" }, /reason/i],
    ["a reason that is only spaces", { field: "cash_exposure" as const, value: 500_000, reason: "      " }, /reason/i],
    ["a one-word reason", { field: "cash_exposure" as const, value: 500_000, reason: "ok" }, /reason/i],
    ["a negative cost", { field: "direct_cost" as const, packageId: WEBSITE, value: -1, reason: REASON }, /cannot be negative/i],
    ["a cost for a service the deal does not have", { field: "direct_cost" as const, packageId: "podcast", value: 100, reason: REASON }, /not part of this deal/i],
    ["a cost with no service named", { field: "direct_cost" as const, value: 100, reason: REASON }, /service/i],
    ["a discount limit above 100%", { field: "discount_limit" as const, value: 10_001, reason: REASON }, /between 0% and 100%/i],
    ["a fractional amount", { field: "cash_exposure" as const, value: 100.5, reason: REASON }, /whole number/i],
    ["a floor given as a number", { field: "contribution_floor" as const, value: 3500, reason: REASON }, /floor/i],
  ])("refuses %s, and changes nothing", async (_n, input, message) => {
    const before = await svc.getState();
    await expect(svc.addInputOverride(input as never)).rejects.toThrow(message);
    expect(await svc.getState()).toEqual(before);
  });

  it("refuses an input it does not know", async () => {
    await expect(svc.addInputOverride({ field: "price" as never, value: 1, reason: REASON })).rejects.toThrow(/cannot be overridden/i);
  });
});

describe("the demo guide", () => {
  it("cannot add or remove an override, change a strategy, or make a counter-offer: those are the merchant's decisions", async () => {
    const { walkthroughCommand } = await import("@/lib/walkthrough-actions");
    for (const action of [
      { action: "add_input_override", field: "cash_exposure", value: 0, reason: REASON },
      { action: "remove_input_override", id: "ovr-1" },
      { action: "set_strategy", strategy: "preserve_scope" },
      { action: "counter_offer", totalPaise: 4_000_000, overrideConfirmed: true, acknowledgedChecks: [] },
      { action: "answer_with_offer", structureId: "phased_scope:scope=web-search-report-3m,plan=upfront" },
      { action: "corridor_view", requestedPaise: 4_000_000, gstBasis: "including" },
    ]) expect(() => walkthroughCommand(action)).toThrow(/invalid walkthrough command/i);
  });
});

describe("once a proposal is live", () => {
  it("an override can be neither added nor removed: the sent version keeps its economics", async () => {
    const added = await costOverride(1_500_000);
    const draft = await svc.reviewBuyerProposal();
    await svc.approveDraft(draft.version, draft.termsHash);
    await svc.sendProposal(draft.version);
    await expect(costOverride(1_700_000)).rejects.toThrow(/keeps the economics it was made with/i);
    await expect(svc.removeInputOverride(added.economics.overrides[0].id)).rejects.toThrow(/keeps the economics it was made with/i);
    // The sent version recorded the economics, overrides included, that it was sent under.
    const sent = (await svc.getState()).agreements.find((v) => v.version === draft.version)!;
    expect(sent.economics?.effectiveHash).toBe(added.economics.effectiveHash);
  });
});
