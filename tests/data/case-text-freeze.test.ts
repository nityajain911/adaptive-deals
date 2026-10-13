import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
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
  // Replaced 13 October 2026 by the Harbour Fresh Foods conversation; the Kestrel text was 81db5502… and its recordings are kept as evidence.
  "reduced-scope": "d4284dcb6945d2667eb88ca4176aa91791dbe0b0606a5f2e09532344b09ec9b7",
  // Replaced 13 October 2026 by the Zephyr Logistics conversation; the Northstar text was 5911d765… (revised 12 October from a98421b3…) and its recordings are kept as evidence.
  "preserve-scope": "8665d2be7a3974b495e3270495d3280f9b28675a09ea86555173e7089f3f5a9e",
  // Replaced 13 October 2026 by the Lotus Row Interiors conversation; the Blue Harbor text was 50465eab…; the Lotus text was first b3a9113e… (recorded, missed) and was reworded once, 13 October 2026. Both recordings are kept as evidence.
  "no-fit": "7b9c47c848781ff716a2ef311c2ce3a7a5cc843a5ad3594d42685998f8f729bb",
};
const recordingFreeze = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/synthetic/CASE_RECORDING_FREEZE.json"), "utf8"),
) as { cases: Record<CaseId, { messagesSha256: string }> };
const revisedFreeze = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/synthetic/CASE_RECORDING_FREEZE_BATCH6.json"), "utf8"),
) as { cases: Record<CaseId, { messagesSha256: string }> };
/** The freeze that names each case's current text: the first batch, except for the revised preserve-scope. */
const heroFreeze = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/synthetic/CASE_RECORDING_FREEZE_BATCH7.json"), "utf8"),
) as { cases: Record<CaseId, { messagesSha256: string }> };
const zephyrFreeze = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/synthetic/CASE_RECORDING_FREEZE_BATCH9.json"), "utf8"),
) as { cases: Record<CaseId, { messagesSha256: string }> };
const lotusFreeze = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/synthetic/CASE_RECORDING_FREEZE_BATCH11.json"), "utf8"),
) as { cases: Record<CaseId, { messagesSha256: string }> };
const freezeFor = (id: CaseId) => (id === "preserve-scope" ? zephyrFreeze : id === "reduced-scope" ? heroFreeze : id === "no-fit" ? lotusFreeze : recordingFreeze);

describe("the case conversations are frozen", () => {
  it.each(allDemoCases().map((c) => [c.id] as const))("%s: its messages hash to the frozen value", (id) => {
    const item = allDemoCases().find((c) => c.id === id)!;
    const current = createHash("sha256").update(canonicalJson(item.deal.messages)).digest("hex");
    expect(current).toBe(FROZEN[id]);
    expect(freezeFor(id).cases[id].messagesSha256).toBe(current);
  });
});
