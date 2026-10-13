import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-deal-list-"));
let service: typeof import("@/lib/service");
beforeAll(async () => { service = await import("@/lib/service"); });

describe("the list of deals", () => {
  it("keeps a deal that was on screen but never started as not started when another deal is opened", async () => {
    const fresh = await service.resetToSeed();
    const other = fresh.caseId === "preserve-scope" ? "no-fit" : "preserve-scope";
    await service.openDeal(other);
    const list = await service.listDeals();
    expect(list.find((d) => d.caseId === fresh.caseId)).toMatchObject({ open: false, started: false, progress: null });
    expect(list.find((d) => d.caseId === other)).toMatchObject({ open: true, started: true });
  });

  it("keeps a started deal's progress when it is set aside", async () => {
    await service.resetToSeed();
    await service.openDeal("reduced-scope");
    await service.openDeal("no-fit");
    const list = await service.listDeals();
    expect(list.find((d) => d.caseId === "reduced-scope")).toMatchObject({ open: false, started: true });
    expect(list.find((d) => d.caseId === "reduced-scope")!.progress).not.toBeNull();
  });
});
