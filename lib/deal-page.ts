import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { DEMO_ANCHOR, SimulatedClock } from "@/domain/clock";
import { localDateOf } from "@/domain/dates";
import { heroMerchant } from "@/data/synthetic/hero";
import type { StageId } from "./progress";
import { currentOutcome, getState, progressOf } from "./service";

/** Deal IDs served by the merchant routes. Only the hero deal exists in this prototype. */
export const DEAL_IDS = ["hero"] as const;

/** Everything a deal stage needs, read once per request (React cache). Unknown IDs → 404. */
export const loadDeal = cache(async (dealId: string) => {
  if (!(DEAL_IDS as readonly string[]).includes(dealId)) notFound();
  await connection();
  const s = await getState();
  const out = await currentOutcome(s);
  const now = new SimulatedClock(DEMO_ANCHOR, s.clockAdvances).now();
  return { s, out, progress: await progressOf(s), now, today: localDateOf(now, heroMerchant.timeZone) };
});

export const stageHref = (dealId: string, stage: StageId) => `/deals/${dealId}/${stage}`;
