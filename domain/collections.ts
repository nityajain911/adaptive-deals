import { addDays, type CalendarDate } from "./dates";
import { sum, type Paise } from "./money";

export type AttemptStatus = "scheduled" | "submitted" | "succeeded" | "failed" | "removed";

export interface CollectionAttempt {
  id: string;
  agreementId: string;
  agreementVersion: number;
  scheduleLineId: string;
  dueDate: CalendarDate;
  amountPaise: Paise;
  prePaise: Paise;
  gstPaise: Paise;
  idempotencyKey: string;
  status: AttemptStatus;
  origin: "agreement" | "internal_retry" | "amendment";
  method: "payment_link" | "recurring_debit";
  razorpayId: string | null;
  history: { at: string; status: AttemptStatus; note: string }[];
}

export class CollectionError extends Error {
  constructor(
    public readonly code: "FULLY_PAID" | "LINE_ALREADY_PAID" | "AWAITING_OUTCOME" | "DUPLICATE_SCHEDULED" | "DUPLICATE_IDEMPOTENCY_KEY" | "INVALID_TRANSITION",
    message: string,
  ) {
    super(message);
  }
}

const TRANSITIONS: Record<AttemptStatus, AttemptStatus[]> = {
  scheduled: ["submitted", "removed"],
  submitted: ["succeeded", "failed"],
  succeeded: [],
  failed: [],
  removed: [],
};

export function idempotencyKey(agreementId: string, version: number, lineId: string, seq: number): string {
  return `ad_${agreementId}_v${version}_${lineId}_${seq}`;
}

export const collectedTotal = (attempts: CollectionAttempt[]) => sum(attempts.filter((a) => a.status === "succeeded").map((a) => a.amountPaise));

/**
 * Schedule a collection attempt, enforcing:
 * - a fully paid agreement cannot trigger another collection;
 * - a line that already succeeded cannot be charged again;
 * - a submitted attempt with a pending outcome blocks any overlapping attempt;
 * - only one scheduled attempt per line; idempotency keys are unique.
 */
export function scheduleAttempt(
  existing: CollectionAttempt[],
  input: Omit<CollectionAttempt, "id" | "idempotencyKey" | "status" | "history" | "razorpayId">,
  agreementTotalPaise: Paise,
  at: string,
): CollectionAttempt {
  if (collectedTotal(existing) >= agreementTotalPaise) throw new CollectionError("FULLY_PAID", "Agreement is fully paid; no further collection can be scheduled");
  const sameLine = existing.filter((a) => a.scheduleLineId === input.scheduleLineId);
  if (sameLine.some((a) => a.status === "succeeded")) throw new CollectionError("LINE_ALREADY_PAID", `Line ${input.scheduleLineId} is already paid`);
  if (existing.some((a) => a.status === "submitted")) throw new CollectionError("AWAITING_OUTCOME", "Awaiting payment outcome; overlapping collection blocked");
  if (sameLine.some((a) => a.status === "scheduled")) throw new CollectionError("DUPLICATE_SCHEDULED", `Line ${input.scheduleLineId} already has a scheduled attempt`);
  const seq = sameLine.length + 1;
  const key = idempotencyKey(input.agreementId, input.agreementVersion, input.scheduleLineId, seq);
  if (existing.some((a) => a.idempotencyKey === key)) throw new CollectionError("DUPLICATE_IDEMPOTENCY_KEY", `Idempotency key ${key} already used`);
  return { ...input, id: `att-${input.scheduleLineId}-${seq}-v${input.agreementVersion}`, idempotencyKey: key, status: "scheduled", razorpayId: null, history: [{ at, status: "scheduled", note: input.origin }] };
}

export function transitionAttempt(a: CollectionAttempt, to: AttemptStatus, at: string, note: string, razorpayId?: string): CollectionAttempt {
  if (!TRANSITIONS[a.status].includes(to)) throw new CollectionError("INVALID_TRANSITION", `Attempt ${a.id} cannot move from ${a.status} to ${to}`);
  return { ...a, status: to, razorpayId: razorpayId ?? a.razorpayId, history: [...a.history, { at, status: to, note }] };
}

/** Submit a scheduled attempt. Blocks if another attempt is already awaiting its outcome or the agreement is fully paid. */
export function submitAttempt(all: CollectionAttempt[], id: string, agreementTotalPaise: Paise, at: string): CollectionAttempt[] {
  const target = all.find((a) => a.id === id);
  if (!target) throw new Error(`Unknown attempt ${id}`);
  if (collectedTotal(all) >= agreementTotalPaise) throw new CollectionError("FULLY_PAID", "Agreement is fully paid; no further collection can be submitted");
  if (all.some((a) => a.status === "submitted")) throw new CollectionError("AWAITING_OUTCOME", "Awaiting payment outcome; overlapping collection blocked");
  if (all.some((a) => a.scheduleLineId === target.scheduleLineId && a.status === "succeeded")) throw new CollectionError("LINE_ALREADY_PAID", `Line ${target.scheduleLineId} is already paid`);
  return all.map((a) => (a.id === id ? transitionAttempt(a, "submitted", at, "submitted") : a));
}

/** After a confirmed failed debit, Adaptive Deals schedules its own internal retry (never submitted automatically). */
export function scheduleInternalRetry(all: CollectionAttempt[], failed: CollectionAttempt, retryAfterDays: number, agreementTotalPaise: Paise, at: string): CollectionAttempt[] {
  if (failed.status !== "failed") throw new Error("Internal retries follow only a confirmed failed attempt");
  const retry = scheduleAttempt(
    all,
    { agreementId: failed.agreementId, agreementVersion: failed.agreementVersion, scheduleLineId: failed.scheduleLineId, dueDate: addDays(failed.dueDate, retryAfterDays), amountPaise: failed.amountPaise, prePaise: failed.prePaise, gstPaise: failed.gstPaise, origin: "internal_retry", method: failed.method },
    agreementTotalPaise,
    at,
  );
  return [...all, retry];
}
