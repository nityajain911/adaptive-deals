import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { DEMO_ANCHOR, SimulatedClock } from "@/domain/clock";
import { localDateOf } from "@/domain/dates";
import { provenanceLabel } from "@/ai/run-record";
import { liveAvailability } from "@/ai/config";
import { heroMerchant } from "@/data/synthetic/hero";
import { currentOutcome, getState, nextDemoStep } from "./service";

/** Everything a view needs, read once per request from the store and re-derived by the engine. */
export const loadPage = cache(async () => {
  await connection();
  const s = await getState();
  const out = await currentOutcome(s);
  const clock = new SimulatedClock(DEMO_ANCHOR, s.clockAdvances);
  return {
    s,
    out,
    now: clock.now(),
    today: localDateOf(clock.now(), heroMerchant.timeZone),
    simulatedDate: clock.isSimulated,
    provenance: provenanceLabel(s.run.record, s.run.viewing),
    next: nextDemoStep(s),
    live: liveAvailability(),
  };
});

import type { AgreementVersion } from "@/domain/agreement";
import type { EvaluatedStructure } from "@/domain/engine";

/** The evaluated structure behind an agreement version (original or amended). */
export function structureFor(page: Awaited<ReturnType<typeof loadPage>>, v: AgreementVersion): EvaluatedStructure | null {
  const a = page.s.amendments.find((x) => x.toVersion === v.version);
  if (a) return a.revised;
  return page.out.evaluation.result?.structures.find((x) => x.structure.id === v.structureId) ?? null;
}
