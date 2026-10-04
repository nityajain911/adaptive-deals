import { DEMO_ANCHOR } from "@/domain/clock";
import { deliveryKey, type DeliveryRecord } from "./deal-records";
import type { DemoState } from "./service";
import { DECISION_BRANCH_SCHEMA, type DecisionBranch } from "./decision-branch";

/**
 * Store schema migration (spec §9). Deterministic and idempotent: it adds compatible state and
 * infers new fields only where existing records prove them. It never rewrites history and never
 * invents a delivery, acceptance or option; ambiguity sets `reviewRequired` instead.
 */
export const STORE_SCHEMA_VERSION = 4;

const SENT_OR_LATER = new Set(["sent", "accepted", "active", "superseded", "buyer_rejected"]);

export function migrateState(raw: unknown): DemoState {
  const s = raw as DemoState;
  // Fields added by the connected buyer journey (schema 1).
  s.conversation ??= [];
  s.suggestionsPaused ??= false;
  s.changeRequests ??= [];
  s.workDispositions ??= [];
  s.reviewRequired ??= null;
  if (s.decisionBranch === undefined) s.decisionBranch = null;
  else if (s.decisionBranch !== null && !validDecisionBranch(s.decisionBranch)) {
    s.decisionBranch = null;
    s.reviewRequired = "The saved decision branch is incomplete or invalid. Inspect records before continuing.";
  }
  if (s.selectedOption) s.selectedOption.evidenceMessageIds ??= [];
  if (s.schemaVersion === STORE_SCHEMA_VERSION) return s;

  s.eligibleAt ??= s.statusHistory?.[0]?.at ?? DEMO_ANCHOR;
  s.outcomes ??= [];
  s.handledMessages ??= [];
  s.interpretations ??= [];

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
    s.selectedOption = v1.length >= 1 && ids.size === 1 ? { structureId: v1[0].structureId, fingerprint: "migrated", selectedAt: v1[0].createdAt, draftVersion: v1[0].status === "draft" ? 1 : null, evidenceMessageIds: [] } : null;
  }

  s.schemaVersion = STORE_SCHEMA_VERSION;
  return s;
}

function validDecisionBranch(value: unknown): value is DecisionBranch {
  if (!value || typeof value !== "object") return false;
  const branch = value as Partial<DecisionBranch>;
  return (
    branch.schema === DECISION_BRANCH_SCHEMA &&
    typeof branch.branchId === "string" &&
    branch.branchId.length > 0 &&
    typeof branch.parentRunId === "string" &&
    branch.parentRunId.length > 0 &&
    typeof branch.createdAt === "string" &&
    branch.reason === "changed_clarification_answers" &&
    branch.explanationSource === "code_fallback" &&
    Array.isArray(branch.answers) &&
    branch.answers.length > 0 &&
    branch.answers.every(
      (answer) =>
        !!answer &&
        typeof answer.questionId === "string" &&
        typeof answer.value === "string" &&
        typeof answer.answerText === "string" &&
        typeof answer.recordedBy === "string" &&
        (answer.confirmedByBuyerVia === "whatsapp" || answer.confirmedByBuyerVia === "email" || answer.confirmedByBuyerVia === "call") &&
        typeof answer.answeredAt === "string",
    )
  );
}
