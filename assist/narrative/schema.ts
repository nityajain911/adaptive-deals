import { z } from "zod";
import { STRATEGY_IDS } from "@/domain/strategy-id";

/** The fact IDs code can establish about an offer (domain/strategy.ts), as strings the model may cite. */
export const FactIdSchema = z.string().regex(/^(highest_contribution|lowest_cash_exposure|most_scope_retained|smallest_largest_payment|lowest_total|earliest_start|no_discount|lowest_discount|within_buyer_approval|needs_buyer_approval|tied_on:[a-z_]+)$/);

const Alias = z.string().regex(/^[A-L]$/);

/** What the model receives: an alias per offer and the fact IDs code established. No amount, cost or guardrail. */
export const NarrativeInputSchema = z.object({
  strategy: z.enum(STRATEGY_IDS),
  offers: z.array(z.object({ alias: Alias, factIds: z.array(FactIdSchema) })).min(1).max(12),
});
export type NarrativeInput = z.infer<typeof NarrativeInputSchema>;

/** What the model returns: for each offer, the fact IDs it used and one sentence. */
export const NarrativeOutputSchema = z.object({
  offers: z.array(z.object({ alias: Alias, fact_ids: z.array(FactIdSchema).min(1), sentence: z.string().min(1).max(300) })).min(1).max(12),
});
export type NarrativeOutput = z.infer<typeof NarrativeOutputSchema>;
