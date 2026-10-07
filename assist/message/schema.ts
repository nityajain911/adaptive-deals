import { z } from "zod";

export const SLOTS = ["total", "payment_count", "first_payment_date", "start_date", "included", "not_included"] as const;
export type Slot = (typeof SLOTS)[number];

/**
 * What the model receives: the buyer's message (untrusted data), the offers the merchant chose to send as an
 * alias, a code-owned headline and the names of the slots code will fill, and an optional merchant note.
 * No amount, cost, floor or guardrail is ever included.
 */
export const MessageInputSchema = z.object({
  buyerRequest: z.string().min(1).max(600),
  offers: z.array(z.object({ alias: z.string().regex(/^[A-L]$/), headline: z.string().min(1).max(160), slots: z.array(z.enum(SLOTS)).min(1) })).min(1).max(6),
  merchantNote: z.string().max(300).optional(),
});
export type MessageInput = z.infer<typeof MessageInputSchema>;

/** The model writes connective text with slot tokens such as {{A.total}}; code fills every slot. */
export const MessageOutputSchema = z.object({ message: z.string().min(1).max(900) });
export type MessageOutput = z.infer<typeof MessageOutputSchema>;
