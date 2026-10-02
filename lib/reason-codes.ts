export const MERCHANT_CLOSE_REASONS = {
  contribution_too_low: "Margin or contribution too low",
  scope_not_worth_delivering: "Scope not worth delivering",
  buyer_unlikely: "Buyer unlikely to proceed",
  handled_elsewhere: "Will handle outside Adaptive Deals",
  other: "Other",
} as const;
export type MerchantCloseReason = keyof typeof MERCHANT_CLOSE_REASONS;

export const BUYER_DECLINE_REASONS = {
  budget: "Budget or timing doesn't work",
  scope: "Scope isn't what we need",
  approval: "Couldn't get internal approval",
  other: "Other",
} as const;
export type BuyerDeclineReason = keyof typeof BUYER_DECLINE_REASONS;
