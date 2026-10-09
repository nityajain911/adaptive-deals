import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "@/domain/agreement";
import { allDemoCases, type CaseId } from "@/data/synthetic/cases";

/**
 * The buyer's and merchant's messages in each case are frozen at the 9 October 2026 checkpoint, before
 * any new model recording. A recording replays only against these exact words, so changing a message
 * means re-recording that case. If you change one on purpose, update the hash here in the same commit
 * and record the case again.
 */
const FROZEN: Record<CaseId, string> = {
  "reduced-scope": "9c76751ebe892e86c968a5e0a5f26b1ff625c777e9ee5529f8a9299dbd5da617",
  "preserve-scope": "14b67339d9fcfdb1079c10a0f90f9dcc943577cf5c2b641e9cf6996513940279",
  "no-fit": "e8641b44a3aef4383d6062b163fc07427b098482e01822dc0eab926d91b1894e",
};

describe("the case conversations are frozen", () => {
  it.each(allDemoCases().map((c) => [c.id] as const))("%s: its messages hash to the frozen value", (id) => {
    const item = allDemoCases().find((c) => c.id === id)!;
    expect(createHash("sha256").update(canonicalJson(item.deal.messages)).digest("hex")).toBe(FROZEN[id]);
  });
});
