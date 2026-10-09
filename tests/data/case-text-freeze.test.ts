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
  "reduced-scope": "81db55020d060e55f8927a2a81a17a3b0da6d7b4c583dbef9d729b8c71f0d7af",
  "preserve-scope": "a98421b32768095881447b048a786171388886f23c17ddc337324ea6c759f30f",
  "no-fit": "e8641b44a3aef4383d6062b163fc07427b098482e01822dc0eab926d91b1894e",
};

describe("the case conversations are frozen", () => {
  it.each(allDemoCases().map((c) => [c.id] as const))("%s: its messages hash to the frozen value", (id) => {
    const item = allDemoCases().find((c) => c.id === id)!;
    expect(createHash("sha256").update(canonicalJson(item.deal.messages)).digest("hex")).toBe(FROZEN[id]);
  });
});
