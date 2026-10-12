import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { driveTo } from "../helpers/drive";

/**
 * The merchant's strategy decides which feasible offer is recommended. Code owns the order; the
 * merchant's explicit choice survives a strategy change; a sent version is locked to its strategy.
 */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-strategy-"));
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic";
type Svc = typeof import("@/lib/service");
let svc: Svc;
let presenter: typeof import("@/lib/presenter-store");
const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
  throw new Error("no network");
});
beforeAll(async () => {
  svc = await import("@/lib/service");
  presenter = await import("@/lib/presenter-store");
});
afterAll(() => fetchSpy.mockRestore());

const TWO_PAYMENTS = "phased_scope:scope=web-search-report-3m,plan=two_monthly";
const UPFRONT = "phased_scope:scope=web-search-report-3m,plan=upfront";
const ANNUAL = "split_payment:plan=quarterly_4";

beforeEach(async () => {
  await svc.resetToSeed();
  await presenter.setFailNextSend(false);
  await driveTo(svc, (s) => s.status === "options_ready");
});

const view = async () => {
  const s = await svc.getState();
  return svc.strategyViewOf(s, await svc.currentOutcome(s));
};

describe("the default strategy", () => {
  it("is Protect contribution, and its leader is set by code: the two-payment phase", async () => {
    const s = await svc.getState();
    expect(s.economics.strategy).toBe("protect_contribution");
    const v = await view();
    expect(v.strategy).toBe("protect_contribution");
    expect(v.leader!.structure.id).toBe(TWO_PAYMENTS);
    expect(v.withinApprovalAlternative).toBeNull();
  });

  it("is what an unselected deal drafts, not the order a model suggested", async () => {
    const draft = await svc.reviewBuyerProposal();
    expect(draft.structureId).toBe(TWO_PAYMENTS);
    expect((await svc.getState()).selectedOption).toMatchObject({ structureId: TWO_PAYMENTS, explicit: false });
  });
});

describe("changing the strategy", () => {
  it("re-ranks the same feasible offers and changes no check and no figure", async () => {
    const before = await view();
    await svc.setStrategy("preserve_scope");
    const after = await view();
    expect(after.strategy).toBe("preserve_scope");
    expect([...after.ranked.map((x) => x.structure.id)].sort()).toEqual([...before.ranked.map((x) => x.structure.id)].sort());
    expect(after.leader!.structure.id).toBe(ANNUAL);
    expect(after.leader!.approval).toBe("requires_approval");
    expect(after.withinApprovalAlternative!.structure.id).toBe(TWO_PAYMENTS);
  });

  it("does not change the deal's effective economics hash", async () => {
    const before = (await svc.getState()).economics.effectiveHash;
    await svc.setStrategy("minimise_cash_exposure");
    expect((await svc.getState()).economics.effectiveHash).toBe(before);
  });

  it("follows an automatic selection: the draft is cleared and the next review drafts the new leader", async () => {
    await svc.reviewBuyerProposal();
    expect((await svc.getState()).selectedOption!.draftVersion).toBe(1);
    const s = await svc.setStrategy("preserve_scope");
    expect(s.selectedOption).toBeNull();
    expect(s.agreements.filter((v) => v.status === "draft")).toEqual([]);
    const draft = await svc.reviewBuyerProposal();
    expect(draft.structureId).toBe(ANNUAL);
    expect(draft.terms.conditions).toContain("buyer_attests_required_approval");
  });

  it("keeps the merchant's explicit choice, and its draft", async () => {
    await svc.selectOption(UPFRONT);
    const draft = await svc.reviewBuyerProposal();
    expect((await svc.getState()).selectedOption).toMatchObject({ structureId: UPFRONT, explicit: true });
    const s = await svc.setStrategy("preserve_scope");
    expect(s.selectedOption).toMatchObject({ structureId: UPFRONT, explicit: true, draftVersion: draft.version });
    expect(s.agreements.find((v) => v.version === draft.version)!.status).toBe("draft");
    // The draft will be sent under the strategy now in force.
    expect(s.agreements.find((v) => v.version === draft.version)!.economics?.strategy).toBe("preserve_scope");
  });

  it("records the strategy on the event log as the merchant's decision", async () => {
    const s = await svc.setStrategy("lower_buyer_commitment");
    expect(s.events.at(-1)).toMatchObject({ kind: "strategy_changed", provenance: "merchant" });
  });

  it("counts confirming the default as the merchant's own choice, once", async () => {
    expect(svc.strategyChosen(await svc.getState())).toBe(false);
    await svc.setStrategy("protect_contribution");
    expect(svc.strategyChosen(await svc.getState())).toBe(true);
    const events = (await svc.getState()).events.length;
    await svc.setStrategy("protect_contribution");
    expect((await svc.getState()).events.length).toBe(events);
  });

  it("refuses a strategy that does not exist, and changes nothing", async () => {
    const before = await svc.getState();
    await expect(svc.setStrategy("maximise_everything" as never)).rejects.toThrow(/unknown strategy/i);
    expect(await svc.getState()).toEqual(before);
  });
});

describe("a sent version is locked to its strategy", () => {
  it("records the strategy it was sent under, refuses a later change, and keeps the record", async () => {
    await svc.setStrategy("preserve_scope");
    const draft = await svc.reviewBuyerProposal();
    await svc.approveDraft(draft.version, draft.termsHash);
    await svc.sendProposal(draft.version);
    const sent = await svc.getState();
    expect(sent.agreements.find((v) => v.version === draft.version)!.economics?.strategy).toBe("preserve_scope");
    await expect(svc.setStrategy("protect_contribution")).rejects.toThrow(/keeps the economics it was made with|keeps the strategy/i);
    expect((await svc.getState()).agreements.find((v) => v.version === draft.version)!.economics?.strategy).toBe("preserve_scope");
  });
});
