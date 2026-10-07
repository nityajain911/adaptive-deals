import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { DEMO_ANCHOR, SimulatedClock } from "@/domain/clock";
import { localDateOf } from "@/domain/dates";
import type { StageId } from "./progress";
import { activeCase, currentOutcome, getState, progressOf } from "./service";
import { dealContextFor, pinnedEconomicsOf } from "./deal-context";

/** Deal IDs served by the merchant routes. Only the hero deal exists in this prototype. */
export const DEAL_IDS = ["hero"] as const;

/** Everything a deal stage needs, read once per request (React cache). Unknown IDs → 404. */
export const loadDeal = cache(async (dealId: string) => {
  if (!(DEAL_IDS as readonly string[]).includes(dealId)) notFound();
  await connection();
  const s = await getState();
  const deal = dealContextFor(s, await pinnedEconomicsOf(s));
  const out = await currentOutcome(s);
  const now = new SimulatedClock(DEMO_ANCHOR, s.clockAdvances).now();
  return { s, out, progress: await progressOf(s), activeCase: activeCase(s), deal, baseline: s.baseline, now, today: localDateOf(now, deal.merchant.timeZone) };
});

export const stageHref = (dealId: string, stage: StageId) => `/deals/${dealId}/${stage}`;
