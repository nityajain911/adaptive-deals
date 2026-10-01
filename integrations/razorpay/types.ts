export type IntegrationMode = "real_test" | "simulated";

export interface PaymentLinkRequest {
  /** Unique per collection attempt (our idempotency key), max 40 chars. */
  referenceId: string;
  amountPaise: number;
  description: string;
  expireByUnix?: number;
  customerName: string;
  notes: Record<string, string>;
}

export interface PaymentLinkState {
  id: string;
  shortUrl: string;
  status: "created" | "partially_paid" | "paid" | "expired" | "cancelled";
  amountPaise: number;
  amountPaidPaise: number;
  referenceId: string;
  mode: IntegrationMode;
}

export interface PaymentLinkAdapter {
  readonly mode: IntegrationMode;
  createPaymentLink(req: PaymentLinkRequest): Promise<PaymentLinkState>;
  fetchPaymentLink(id: string): Promise<PaymentLinkState>;
}

export interface MandateRegistration {
  id: string;
  status: "pending" | "confirmed" | "revoked" | "expired";
  perDebitLimitPaise: number;
  endDate: string;
  mode: IntegrationMode;
  /** Why this path is simulated, shown in the UI. */
  note: string;
}

export interface RecurringAdapter {
  readonly mode: IntegrationMode;
  registerMandate(args: { referenceId: string; perDebitLimitPaise: number; endDate: string; customerName: string }): Promise<MandateRegistration>;
}
