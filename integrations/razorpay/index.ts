import { checkRazorpayKey, type KeyCheck } from "./keys";
import { RazorpayTestPaymentLinks, SimulatedPaymentLinks } from "./payment-links";
import { SimulatedRecurring } from "./recurring";
import type { PaymentLinkAdapter, PaymentLinkState, RecurringAdapter } from "./types";

export * from "./types";
export { checkRazorpayKey, assertTestKey, LiveKeyRefusedError } from "./keys";
export { RECURRING_SIMULATION_NOTE } from "./recurring";

export interface PaymentAdapters {
  links: PaymentLinkAdapter;
  recurring: RecurringAdapter;
  keyCheck: KeyCheck;
}

/**
 * Real Razorpay test mode for payment links only when a valid rzp_test_ key pair is configured
 * and RAZORPAY_MODE=test; otherwise everything is simulated. Recurring is always simulated.
 */
export function paymentAdapters(env: Record<string, string | undefined> = process.env, existingSimulatedLinks: PaymentLinkState[] = []): PaymentAdapters {
  const keyCheck = checkRazorpayKey(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET);
  const wantTest = env.RAZORPAY_MODE === "test";
  const links = wantTest && keyCheck.ok ? new RazorpayTestPaymentLinks(keyCheck.keyId, env.RAZORPAY_KEY_SECRET!) : new SimulatedPaymentLinks(existingSimulatedLinks);
  return { links, recurring: new SimulatedRecurring(), keyCheck };
}
