import { z } from "zod";

export const MAX_SOURCE_CHARS = 20_000;

export const ProfileInputSchema = z.object({ kind: z.enum(["text", "csv"]), source: z.string().min(1).max(MAX_SOURCE_CHARS) });
export type ProfileInput = z.infer<typeof ProfileInputSchema>;

const Evidenced = z.object({
  rupees: z.number().min(0),
  /** Copied character for character from the source. */
  quote: z.string().min(1).max(200),
  /** 0-based character index in the source where the quote starts. */
  start: z.number().int().min(0),
});

export const ProfileOutputSchema = z.object({
  services: z.array(z.object({
    name: z.string().min(1).max(80),
    kind: z.enum(["one_time", "monthly", "unclear"]),
    list_price: Evidenced.nullable(),
    direct_cost: Evidenced.nullable(),
  })).max(40),
  suspected_instructions: z.array(z.string().max(200)).max(20),
});
export type ProfileOutput = z.infer<typeof ProfileOutputSchema>;
