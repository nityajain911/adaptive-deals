import { formatINR } from "@/domain/money";
import type { ContributionFloor } from "@/domain/types";
import type { InputOverride, OverrideField } from "./deal-economics";

const pct = (bps: number) => `${bps / 100}%`;

/** A deal override's value in the merchant's words. */
export function overrideValueText(field: OverrideField, value: number | ContributionFloor): string {
  if (typeof value !== "number") {
    const parts = [value.minPercentBps !== null ? `${pct(value.minPercentBps)} of the price` : null, value.minPaise !== null ? formatINR(value.minPaise) : null].filter(Boolean);
    return parts.length === 2 ? `${parts.join(value.combine === "both" ? " and " : " or ")}` : parts.join("");
  }
  return field === "discount_limit" ? pct(value) : formatINR(value);
}

export const OVERRIDE_DIRECTION_TEXT: Record<InputOverride["direction"], string> = {
  loosens: "Loosens your account rule",
  tightens: "Tightens your account rule",
  neutral: "Same as your account rule",
};

export const OVERRIDE_FIELD_LABEL: Record<Exclude<OverrideField, "direct_cost">, string> = {
  contribution_floor: "Lowest profit I'll accept",
  cash_exposure: "Most I'll spend before I'm paid",
  discount_limit: "Biggest discount I'll give",
};
