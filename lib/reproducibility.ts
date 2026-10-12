import "server-only";
import { replayRun } from "@/ai/orchestrator";
import { FixedClock } from "@/domain/clock";
import { dealForStateExport } from "./service";
import type { DemoState } from "./service";

export type Reproduction = { ok: true } | { ok: false; reason: string };

/** Whether the stored run replays to exactly the same engine result and displayed text, with no model call. */
export async function checkReproduced(s: DemoState): Promise<Reproduction> {
  try {
    await replayRun(s.run.record, dealForStateExport(s), new FixedClock());
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "The stored run could not be replayed" };
  }
}
