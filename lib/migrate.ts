import { DEMO_ANCHOR } from "@/domain/clock";
import { deliveryKey, type DeliveryRecord } from "./deal-records";
import type { DemoState } from "./service";

/**
 * Store schema migration (spec §9). Deterministic and idempotent: it adds compatible state and
 * infers new fields only where existing records prove them. It never rewrites history and never
 * invents a delivery, acceptance or option; ambiguity sets `reviewRequired` instead.
 */
export const STORE_SCHEMA_VERSION = 2;

const SENT_OR_LATER = new Set(["sent", "accepted", "active", "superseded", "buyer_rejected"]);

export function migrateState(raw: unknown): DemoState {
  const s = raw as DemoState;
  // Fields added by the connected buyer journey (schema 1).
  s.conversation ??= [];
  s.suggestionsPaused ??= false;
  s.changeRequests ??= [];
  if (s.schemaVersion === STORE_SCHEMA_VERSION) return s;

  s.eligibleAt ??= s.statusHistory?.[0]?.at ?? DEMO_ANCHOR;
  s.outcomes ??= [];
  s.handledMessages ??= [];
  s.interpretations ??= [];
  s.reviewRequired ??= null;

  if (s.deliveries === undefined) {
    const deliveries: DeliveryRecord[] = [];
    for (const v of s.agreements.filter((a) => SENT_OR_LATER.has(a.status))) {
      const msg = s.conversation.find(
        (i) => i.direction === "outbound" && i.author === "code" && (i.kind === "proposal" || i.kind === "amendment") && i.refs.agreementVersion === v.version && !!i.sentAt,
      );
      if (!msg) {
        s.reviewRequired = `Version ${v.version} is marked sent but no delivery message is recorded.`;
        continue;
      }
      const key = deliveryKey(v.agreementId, v.version);
      deliveries.push({
        version: v.version,
        idempotencyKey: key,
        kind: msg.kind === "amendment" ? "amendment" : "proposal",
        attempts: [{ attemptId: `${key}_a1`, at: msg.sentAt!, status: "sent", failureReason: null }],
        deliveredAt: msg.sentAt!,
        reference: msg.id,
      });
    }
    s.deliveries = deliveries;
  }

  if (s.selectedOption === undefined) {
    const v1 = s.agreements.filter((a) => a.version === 1);
    const ids = new Set(v1.map((a) => a.structureId));
    // "migrated" never equals a computed fingerprint, so a migrated draft must be reviewed again.
    s.selectedOption = v1.length >= 1 && ids.size === 1 ? { structureId: v1[0].structureId, fingerprint: "migrated", selectedAt: v1[0].createdAt, draftVersion: v1[0].status === "draft" ? 1 : null } : null;
  }

  s.schemaVersion = STORE_SCHEMA_VERSION;
  return s;
}
