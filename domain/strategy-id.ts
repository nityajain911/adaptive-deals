export const STRATEGY_IDS = ["protect_contribution", "preserve_scope", "minimise_cash_exposure", "lower_buyer_commitment"] as const;

export type StrategyId = (typeof STRATEGY_IDS)[number];
