import { CollectionError, scheduleAttempt, transitionAttempt, type CollectionAttempt } from "./collections";
import { addDays, addMonthsToMonth, compareDates, startOfMonth, type CalendarDate, type DateValue } from "./dates";
import { evaluateStructure, type EngineInput, type EvaluatedStructure } from "./engine";
import { checkMandateFit, type Mandate, type MandateFit } from "./mandate";
import type { Structure } from "./structures";
import type { BuyerConstraints } from "./types";
import type { AgreementVersion } from "./agreement";

export type AmendmentState = "proposed" | "merchant_approved" | "buyer_accepted" | "collection_updated" | "active" | "rejected";

const AMENDMENT_TRANSITIONS: Record<AmendmentState, AmendmentState[]> = {
  proposed: ["merchant_approved", "rejected"],
  merchant_approved: ["buyer_accepted", "rejected"],
  buyer_accepted: ["collection_updated"],
  collection_updated: ["active"],
  active: [],
  rejected: [],
};

export interface Amendment {
  id: string;
  agreementId: string;
  fromVersion: number;
  toVersion: number;
  trigger: "failed_debit" | "buyer_message";
  triggerRefs: string[];
  change: { lineId: string; fromDueDate: CalendarDate; toDueDate: CalendarDate };
  state: AmendmentState;
  mandateFit: MandateFit;
  revised: EvaluatedStructure;
  history: { at: string; state: AmendmentState }[];
}

export const RETRY_REMOVED_COPY = "Adaptive Deals retry removed; revised payment scheduled.";

export const CASH_UNAVAILABLE_UNTIL_RULE =
  "“Cash tight till <date>” means the buyer's cash is unavailable through that date, inclusive. The earliest revised debit is the next day (day precision) or the first day of the next month (month precision). Code computes it; the revision is then re-checked against buyer constraints, seller policy and the mandate.";

/** Earliest debit date after a buyer says cash is unavailable until `until` (inclusive). */
export function earliestDebitAfterUnavailableUntil(until: DateValue): CalendarDate {
  return until.precision === "day" ? addDays(until.value, 1) : startOfMonth(addMonthsToMonth(until.value, 1));
}

export function rescheduleLine(s: Structure, lineId: string, newDate: CalendarDate): Structure {
  const line = s.payments.find((p) => p.id === lineId);
  if (!line) throw new Error(`Unknown payment line ${lineId}`);
  return {
    ...s,
    id: `${s.id}#${lineId}@${newDate}`,
    params: { ...s.params, [`${lineId}_rescheduled_to`]: newDate },
    payments: s.payments.map((p) => (p.id === lineId ? { ...p, dueDate: newDate } : p)),
    invoices: s.invoices.map((i) => (i.paymentLineId === lineId ? { ...i, invoiceDate: newDate } : i)),
  };
}

/**
 * Propose moving one payment line. The revision is re-checked against buyer constraints and
 * seller policy by the same engine, and against the existing mandate.
 */
export function proposeReschedule(args: {
  id: string;
  from: AgreementVersion;
  structure: Structure;
  lineId: string;
  newDueDate: CalendarDate;
  constraints: BuyerConstraints;
  engine: EngineInput;
  mandate: Mandate;
  trigger: Amendment["trigger"];
  triggerRefs: string[];
  at: string;
}): Amendment {
  const original = args.structure.payments.find((p) => p.id === args.lineId);
  if (!original) throw new Error(`Unknown payment line ${args.lineId}`);
  const revisedStructure = rescheduleLine(args.structure, args.lineId, args.newDueDate);
  const revised = evaluateStructure(revisedStructure, args.constraints, args.engine);
  const debits = revisedStructure.payments
    .filter((p) => p.method === "recurring_debit" && compareDates(p.dueDate, original.dueDate) >= 0)
    .map((p) => ({ lineId: p.id, dueDate: p.dueDate, totalPaise: p.totalPaise }));
  return {
    id: args.id,
    agreementId: args.from.agreementId,
    fromVersion: args.from.version,
    toVersion: args.from.version + 1,
    trigger: args.trigger,
    triggerRefs: args.triggerRefs,
    change: { lineId: args.lineId, fromDueDate: original.dueDate, toDueDate: args.newDueDate },
    state: revised.approvable ? "proposed" : "rejected",
    mandateFit: checkMandateFit(args.mandate, debits),
    revised,
    history: [{ at: args.at, state: revised.approvable ? "proposed" : "rejected" }],
  };
}

export function transitionAmendment(a: Amendment, to: AmendmentState, at: string): Amendment {
  if (!AMENDMENT_TRANSITIONS[a.state].includes(to)) throw new Error(`Amendment cannot move from ${a.state} to ${to}`);
  return { ...a, state: to, history: [...a.history, { at, state: to }] };
}

/**
 * Apply an accepted revision to collection attempts, per the freeze-pack table:
 * - scheduled only in Adaptive Deals → removed;
 * - submitted, outcome pending → blocked (Awaiting payment outcome);
 * - confirmed failed → kept in history;
 * - confirmed successful → kept; that line is not charged again.
 * Then schedule the newly agreed attempts under the new version.
 */
export function applyCollectionUpdate(args: {
  attempts: CollectionAttempt[];
  amendment: Amendment;
  newVersion: AgreementVersion;
  agreementTotalPaise: number;
  at: string;
}): { attempts: CollectionAttempt[]; removed: CollectionAttempt[]; scheduled: CollectionAttempt[] } {
  const { amendment, newVersion, at } = args;
  if (amendment.state !== "buyer_accepted") throw new Error("Collections change only after the buyer accepts the revision");
  if (args.attempts.some((a) => a.status === "submitted")) throw new CollectionError("AWAITING_OUTCOME", "Awaiting payment outcome; revision cannot change collection yet");

  const removed: CollectionAttempt[] = [];
  let attempts = args.attempts.map((a) => {
    if (a.status !== "scheduled") return a;
    const r = transitionAttempt(a, "removed", at, a.origin === "internal_retry" ? RETRY_REMOVED_COPY : `superseded by version ${newVersion.version}`);
    removed.push(r);
    return r;
  });

  const scheduled: CollectionAttempt[] = [];
  const paidLines = new Set(attempts.filter((a) => a.status === "succeeded").map((a) => a.scheduleLineId));
  for (const line of newVersion.terms.paymentSchedule) {
    if (paidLines.has(line.id)) continue;
    if (line.method !== "recurring_debit" && line.id !== amendment.change.lineId) continue;
    const next = scheduleAttempt(
      attempts,
      {
        agreementId: newVersion.agreementId,
        agreementVersion: newVersion.version,
        scheduleLineId: line.id,
        dueDate: line.dueDate.value,
        amountPaise: line.totalPaise,
        prePaise: line.prePaise,
        gstPaise: line.gstPaise,
        origin: line.id === amendment.change.lineId ? "amendment" : "agreement",
        method: line.method as CollectionAttempt["method"],
      },
      args.agreementTotalPaise,
      at,
    );
    attempts = [...attempts, next];
    scheduled.push(next);
  }
  return { attempts, removed, scheduled };
}
