import { z } from "zod";
import { SYSTEM_STEPS, type SystemStepId } from "./demo-steps";

export type WalkthroughCommand =
  | { action: "demo_system_step"; stepId: SystemStepId }
  | { action: "buyer_reply"; inReplyTo: string; scriptId?: string; text?: string }
  | { action: "reset" };

const BuyerReply = z
  .object({
    action: z.literal("buyer_reply"),
    inReplyTo: z.string().min(1).max(40),
    scriptId: z.string().min(1).max(40).optional(),
    text: z.string().trim().min(1).max(500).optional(),
  })
  .refine((value) => Boolean(value.scriptId) !== Boolean(value.text), "Choose one buyer reply source");

const WalkthroughCommandSchema = z.union([
  z.object({ action: z.literal("demo_system_step"), stepId: z.enum(SYSTEM_STEPS as unknown as [SystemStepId, ...SystemStepId[]]) }),
  BuyerReply,
  z.object({ action: z.literal("reset") }),
]);

export function walkthroughCommand(input: unknown): WalkthroughCommand {
  const parsed = WalkthroughCommandSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid walkthrough command");
  return parsed.data;
}

/** Reset is structurally separate from tutorial steps and exists only after explicit confirmation. */
export function confirmedRestartCommand(confirmed: boolean): WalkthroughCommand | null {
  return confirmed ? { action: "reset" } : null;
}
