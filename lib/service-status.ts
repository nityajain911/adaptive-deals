import type { EconomicsGuardrails } from "@/domain/business-economics";
import type { ServicePackage } from "@/domain/types";

export type ServiceStatusTone = "green" | "amber" | "red";
export interface ServiceStatus {
  keepPaise: number;
  /** Share of the price you keep before payment fees, in whole percent. */
  keepPercent: number;
  tone: ServiceStatusTone;
  label: string;
}

/**
 * The one-word state of a service row, from its own price and cost and the merchant's lowest-profit limit.
 * Indicative only (before payment fees); the full check on "Check my changes" is the engine's.
 */
export function serviceStatus(service: Pick<ServicePackage, "listPricePaise" | "directCostPaise">, guardrails: Pick<EconomicsGuardrails, "contributionFloor">): ServiceStatus {
  const keepPaise = service.listPricePaise - service.directCostPaise;
  const keepPercent = service.listPricePaise > 0 ? Math.round((keepPaise * 100) / service.listPricePaise) : 0;
  const base = { keepPaise, keepPercent };
  if (keepPaise < 0) return { ...base, tone: "red", label: "Costs more than you charge" };
  if (service.directCostPaise === 0) return { ...base, tone: "amber", label: "Add a cost" };
  const floor = guardrails.contributionFloor;
  const needs: boolean[] = [];
  if (floor.minPercentBps !== null) needs.push(keepPaise * 10_000 >= floor.minPercentBps * service.listPricePaise);
  if (floor.minPaise !== null) needs.push(keepPaise >= floor.minPaise);
  const ok = needs.length === 0 ? true : floor.combine === "either" ? needs.some(Boolean) : needs.every(Boolean);
  return ok ? { ...base, tone: "green", label: "Ready" } : { ...base, tone: "amber", label: "Below your lowest profit" };
}
