import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-economics-"));
const store = await import("@/lib/economics-store");
const { defaultEconomicsContent } = await import("@/lib/economics-default");
const { EconomicsError } = await import("@/domain/business-economics");
const AT = "2026-10-06T10:00:00+05:30";

beforeEach(() => store.resetEconomicsStore());

describe("the account economics store", () => {
  it("starts with version 1 and no draft", async () => {
    const state = await store.getEconomicsStore();
    expect(state.versions.map((version) => version.version)).toEqual([1]);
    expect(state.draft).toBeNull();
    expect((await store.activeEconomics()).version).toBe(1);
  });

  it("keeps a draft separate from the active version until it is activated", async () => {
    const draft = defaultEconomicsContent();
    draft.services[0].directCostPaise += 50_000;
    expect(await store.saveEconomicsDraft(draft)).toEqual([]);
    expect((await store.activeEconomics()).services[0].directCostPaise).not.toBe(draft.services[0].directCostPaise);
    const version2 = await store.activateEconomicsDraft("Merchant (Pinecone Media Works)", AT);
    expect(version2.version).toBe(2);
    expect((await store.activeEconomics()).hash).toBe(version2.hash);
    expect((await store.getEconomicsStore()).draft).toBeNull();
    expect((await store.economicsVersion(1))?.version).toBe(1);
  });

  it("refuses to activate an invalid draft, or one identical to the active version", async () => {
    const invalid = defaultEconomicsContent();
    invalid.discountLadderBps = [0, 500];
    expect((await store.saveEconomicsDraft(invalid)).some((issue) => issue.level === "error")).toBe(true);
    await expect(store.activateEconomicsDraft("m", AT)).rejects.toThrow(EconomicsError);
    await store.saveEconomicsDraft(defaultEconomicsContent());
    await expect(store.activateEconomicsDraft("m", AT)).rejects.toThrow(/no change/i);
    expect((await store.getEconomicsStore()).versions).toHaveLength(1);
  });

  it("restores the demo defaults as a new version, and does nothing when they already apply", async () => {
    expect((await store.restoreDefaultEconomics("m", AT)).version).toBe(1);
    const draft = defaultEconomicsContent();
    draft.guardrails.cashAtRiskLimitPaise += 100;
    await store.saveEconomicsDraft(draft);
    await store.activateEconomicsDraft("m", AT);
    const restored = await store.restoreDefaultEconomics("m", AT);
    expect(restored.version).toBe(3);
    expect(restored.hash).toBe((await store.economicsVersion(1))?.hash);
  });
});
