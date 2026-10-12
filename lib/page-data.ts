import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { DEMO_ANCHOR, SimulatedClock } from "@/domain/clock";
import { localDateOf } from "@/domain/dates";
import { provenanceLabel } from "@/ai/run-record";
import { liveAvailability, readAiConfig } from "@/ai/config";
import { providerDisplayName } from "./model-provenance";
import { currentOutcome, getState } from "./service";
import { dealContextFor, pinnedEconomicsOf } from "./deal-context";

/** Everything a view needs, read once per request from the store and re-derived by the engine. */
export const loadPage = cache(async () => {
  await connection();
  const s = await getState();
  const deal = dealContextFor(s, await pinnedEconomicsOf(s));
  const out = await currentOutcome(s);
  const clock = new SimulatedClock(DEMO_ANCHOR, s.clockAdvances);
  return {
    s,
    out,
    now: clock.now(),
    today: localDateOf(clock.now(), deal.merchant.timeZone),
    deal,
    baseline: s.baseline,
    simulatedDate: clock.isSimulated,
    provenance: provenanceLabel(s.run.record, s.run.viewing),
    live: liveProviderDiagnostics(),
  };
});

/** Read-only diagnostics for presenter and server-rendered views. Credentials are never returned. */
export function liveProviderDiagnostics(env: Record<string, string | undefined> = process.env) {
  const configured = readAiConfig(env);
  const availability = liveAvailability(env);
  return {
    provider: configured.provider,
    providerName: providerDisplayName(configured.provider),
    model: configured.model,
    available: availability.available,
    reason: availability.available ? null : availability.reason,
  };
}

import type { AgreementVersion } from "@/domain/agreement";
import type { EvaluatedStructure } from "@/domain/engine";
import { evaluatedForVersion } from "./version-structure";

/** The evaluated structure behind an agreement version (original or amended). */
export function structureFor(page: Awaited<ReturnType<typeof loadPage>>, v: AgreementVersion): EvaluatedStructure | null {
  return evaluatedForVersion(page.s, v, page.out);
}
