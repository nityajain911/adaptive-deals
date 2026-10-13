import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CASE_IDS } from "@/data/synthetic/cases";

process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-deal-econ-"));
let service: typeof import("@/lib/service");
beforeAll(async () => { service = await import("@/lib/service"); });

describe("a new deal", () => {
  it("can seed pinned economics while resetting an empty deal store", async () => {
    rmSync(path.join(process.env.ADAPTIVE_DEALS_DATA_DIR!, "store.json"), { force: true });
    const state = await service.resetToSeed();
    expect(state.economics.pinned.version).toBe(1);
  }, 1_000);

  it.each(CASE_IDS)("%s: pins version 1, snapshots prices, and starts on Protect contribution", async (id) => {
    const state = await service.startCase(id);
    expect(state.economics).toMatchObject({ pinned: { version: 1 }, overrides: [], strategy: "protect_contribution" });
    // The discount case quotes a six-month retainer (₹72,000 + GST); the others quote the year (₹1,20,000 + GST).
    expect(state.baseline.quotedTotalPaise).toBe(id === "preserve-scope" ? 8_496_000 : 14_160_000);
    expect(state.baseline.servicePrices).toHaveLength(4);
    expect(state.economics.effectiveHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps the quoted prices when a newer version with other standard prices is active, and takes that version's costs", async () => {
    const economics = await import("@/lib/economics-store");
    const { defaultEconomicsContent } = await import("@/lib/economics-default");
    const draft = defaultEconomicsContent();
    draft.services[0].listPricePaise += 600_000;
    draft.services[0].directCostPaise += 100_000;
    await economics.saveEconomicsDraft(draft);
    await economics.activateEconomicsDraft("Merchant (Pinecone Media Works)", "2026-10-06T10:00:00+05:30");
    const state = await service.startCase("reduced-scope");
    expect(state.economics.pinned.version).toBe(2);
    expect(state.baseline.servicePrices[0].listPricePaise).toBe(2_400_000);
    expect(state.baseline.quotedTotalPaise).toBe(14_160_000);
    await economics.resetEconomicsStore();
  });

  it("has its own effective hash for each buyer with agreed terms, and the account's for the others", async () => {
    const hashes: Record<string, string> = {};
    for (const id of CASE_IDS) hashes[id] = (await service.startCase(id)).economics.effectiveHash;
    expect(new Set(Object.values(hashes)).size).toBe(3);
  });
});
