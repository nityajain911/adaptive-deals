import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { demoCase } from "@/data/synthetic/cases";

process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-context-"));
let service: typeof import("@/lib/service");
let context: typeof import("@/lib/deal-context");
let economics: typeof import("@/lib/economics-store");
beforeAll(async () => {
  service = await import("@/lib/service");
  context = await import("@/lib/deal-context");
  economics = await import("@/lib/economics-store");
});

describe("a deal context", () => {
  it("reconstructs the case deal from its pinned economics", async () => {
    const state = await service.startCase("reduced-scope");
    const version = await economics.economicsVersion(1);
    expect(context.dealContextFor(state, version!)).toEqual(demoCase("reduced-scope")?.deal);
  });

  it("reads the original proposal from the immutable baseline", async () => {
    const state = await service.startCase("reduced-scope");
    expect(context.originalProposalOf(state.baseline)).toEqual({
      prePaise: 12_000_000,
      gstPaise: 2_160_000,
      totalPaise: 14_160_000,
      gstRateBps: 1800,
    });
  });
});
