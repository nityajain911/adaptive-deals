import { createHash } from "node:crypto";
import { canonicalJson, termsHash, type CanonicalTerms } from "@/domain/agreement";
export { BUYER_DECLINE_REASONS, MERCHANT_CLOSE_REASONS } from "./reason-codes";
export type { BuyerDeclineReason, MerchantCloseReason } from "./reason-codes";

/**
 * Additive deal records for the merchant-decision redesign (spec §3.2). Records reference
 * existing data; they never copy engine results, terms or payment records.
 */
export interface SelectedOption {
  structureId: string;
  /** Deterministic fingerprint of the eligible options and the selected option's terms. */
  fingerprint: string;
  selectedAt: string;
  draftVersion: number | null;
}

export interface DeliveryAttempt {
  attemptId: string;
  at: string;
  status: "sent" | "failed";
  failureReason: string | null;
}

/** One per proposal or amendment version: a stable idempotency key and its attempts. */
export interface DeliveryRecord {
  version: number;
  idempotencyKey: string;
  kind: "proposal" | "amendment";
  attempts: DeliveryAttempt[];
  deliveredAt: string | null;
  reference: string | null;
}

export type OutcomeType = "merchant_closed" | "buyer_declined" | "buyer_requested_change" | "buyer_accepted" | "option_selected";

/** Append-only outcome record. Links to an existing event, message or action instead of duplicating it. */
export interface OutcomeRecord {
  id: string;
  type: OutcomeType;
  reasonCode: string | null;
  note: string | null;
  actor: "merchant" | "buyer" | "system";
  at: string;
  dealId: string;
  version: number | null;
  source: { kind: "event" | "message" | "action"; id: string } | null;
}

export interface HandledMessage {
  messageId: string;
  handledAt: string;
  actor: "merchant";
  note: string | null;
}

/** A merchant's interpretation of an unsupported clarification reply (merchant judgement, not AI). */
export interface Interpretation {
  messageId: string;
  questionId: string;
  value: string;
  quote: string;
  actor: "merchant";
  at: string;
}

/** Deterministic: sorted eligible option IDs plus the selected option's canonical terms hash. */
export function decisionFingerprint(eligibleIds: string[], selectedTerms: CanonicalTerms): string {
  const payload = canonicalJson({ eligible: [...eligibleIds].sort(), selected: termsHash(selectedTerms) });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export const deliveryKey = (agreementId: string, version: number) => `deliver_${agreementId}_v${version}`;

export const isDelivered = (deliveries: DeliveryRecord[], version: number) => deliveries.some((d) => d.version === version && d.deliveredAt !== null);
