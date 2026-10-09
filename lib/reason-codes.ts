import type { CheckCode } from "@/domain/checks";
import { failingChecks, type EvaluatedStructure } from "@/domain/engine";

export const MERCHANT_CLOSE_REASONS = {
  contribution_too_low: "Margin or contribution too low",
  cannot_meet_start_date: "Cannot meet the requested start date",
  scope_not_worth_delivering: "Scope not worth delivering",
  buyer_unlikely: "Buyer unlikely to proceed",
  handled_elsewhere: "Will handle outside Adaptive Deals",
  other: "Other",
} as const;
export type MerchantCloseReason = keyof typeof MERCHANT_CLOSE_REASONS;

const REASON_FOR_FAILED_CHECK: Partial<Record<CheckCode, MerchantCloseReason>> = {
  START_AFTER_LATEST_START: "cannot_meet_start_date",
  CONTRIBUTION_BELOW_FLOOR: "contribution_too_low",
};

/** Suggest only when the failed checks support one unambiguous merchant reason. */
export function suggestedMerchantCloseReason(codes: readonly CheckCode[]): MerchantCloseReason | null {
  const supported = [...new Set(codes.map((code) => REASON_FOR_FAILED_CHECK[code]).filter((reason): reason is MerchantCloseReason => !!reason))];
  return supported.length === 1 ? supported[0] : null;
}

/** Failed checks shared by every evaluated offer: the blockers that truly prevent any offer. */
export function failedChecksBlockingEveryStructure(structures: readonly EvaluatedStructure[]): CheckCode[] {
  if (!structures.length) return [];
  const first = [...new Set(failingChecks(structures[0]).map((check) => check.code))];
  return first.filter((code) => structures.every((structure) => failingChecks(structure).some((check) => check.code === code)));
}

export const BUYER_DECLINE_REASONS = {
  budget: "Budget or timing doesn't work",
  scope: "Scope isn't what we need",
  approval: "Couldn't get internal approval",
  other: "Other",
} as const;
export type BuyerDeclineReason = keyof typeof BUYER_DECLINE_REASONS;
