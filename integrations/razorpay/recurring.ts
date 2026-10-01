import type { MandateRegistration, RecurringAdapter } from "./types";

export const RECURRING_SIMULATION_NOTE =
  "Simulated: Razorpay Recurring Payments needs a recurring-enabled test account, a customer, an authorisation payment and the buyer's bank or UPI approval. None of that can be exercised in this local prototype, so mandate registration and debits are simulated with labelled events.";

/**
 * Simulated recurring adapter. Used for every mandate in this prototype; registration starts
 * pending and is confirmed only by an explicit, labelled simulated event.
 */
export class SimulatedRecurring implements RecurringAdapter {
  readonly mode = "simulated" as const;
  async registerMandate(args: { referenceId: string; perDebitLimitPaise: number; endDate: string }): Promise<MandateRegistration> {
    return { id: `mdt_sim_${args.referenceId.replace(/[^A-Za-z0-9]/g, "").slice(-14)}`, status: "pending", perDebitLimitPaise: args.perDebitLimitPaise, endDate: args.endDate, mode: this.mode, note: RECURRING_SIMULATION_NOTE };
  }
}
