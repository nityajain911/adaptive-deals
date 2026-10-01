import type { Clock } from "./clock";
import type { CollectionAttempt } from "./collections";
import { addDays, compareDates, localDateOf, type CalendarDate } from "./dates";
import { formatINR } from "./money";
import type { MerchantPolicy, Message } from "./types";

/**
 * Adaptive Deals sends its own notice before each recurring debit (FP §12). In the prototype
 * the notice is always simulated and labelled; no message is delivered to a real buyer.
 */
export interface AdvanceNotice {
  id: string;
  agreementId: string;
  agreementVersion: number;
  attemptId: string;
  scheduleLineId: string;
  dueDate: CalendarDate;
  amountPaise: number;
  sendOn: CalendarDate;
  sentAt: string | null;
  channel: "whatsapp" | "email";
  mode: "simulated";
  text: string;
}

export function planAdvanceNotice(attempt: CollectionAttempt, policy: MerchantPolicy, channel: AdvanceNotice["channel"] = "whatsapp"): AdvanceNotice {
  if (attempt.method !== "recurring_debit") throw new Error("Advance notices precede recurring debits only");
  if (attempt.status !== "scheduled") throw new Error(`Cannot plan a notice for a ${attempt.status} attempt`);
  return {
    id: `notice-${attempt.id}`,
    agreementId: attempt.agreementId,
    agreementVersion: attempt.agreementVersion,
    attemptId: attempt.id,
    scheduleLineId: attempt.scheduleLineId,
    dueDate: attempt.dueDate,
    amountPaise: attempt.amountPaise,
    sendOn: addDays(attempt.dueDate, -policy.advanceNoticeDays),
    sentAt: null,
    channel,
    mode: "simulated",
    text: `Reminder: ${formatINR(attempt.amountPaise)} (incl. GST) will be debited on ${attempt.dueDate} under your mandate.`,
  };
}

/** Send on or after `sendOn` and strictly before the debit date, using the injected clock. */
export function sendAdvanceNotice(n: AdvanceNotice, clock: Clock, timeZone: string): AdvanceNotice {
  if (n.sentAt) throw new Error("Notice already sent");
  const today = localDateOf(clock.now(), timeZone);
  if (compareDates(today, n.sendOn) < 0) throw new Error(`Notice is due on ${n.sendOn}, not ${today}`);
  if (compareDates(today, n.dueDate) >= 0) throw new Error("A notice must be sent before the debit date");
  return { ...n, sentAt: clock.now() };
}

/** Record a buyer message as a reply to a sent notice. The reply keeps its own timestamp. */
export function recordReplyToNotice(n: AdvanceNotice, reply: Omit<Message, "inReplyTo">): Message {
  if (!n.sentAt) throw new Error("Cannot reply to a notice that was not sent");
  if (reply.author !== "buyer") throw new Error("Only the buyer replies to an advance notice");
  if (Date.parse(reply.timestamp) < Date.parse(n.sentAt)) throw new Error("A reply cannot precede the notice it answers");
  return { ...reply, inReplyTo: n.id };
}
