import type { CollectionAttempt } from "./collections";
import type { ConversationItem } from "./conversation";
import type { CalendarDate } from "./dates";
import type { AdvanceNotice } from "./notices";

/**
 * Buyer-triggered restructuring. Distinct states, in order:
 *   change_requested → draft_amendment → (amendment: merchant_approved → buyer_accepted →
 *   collection_updated → active) → payment_rescheduled
 * or change_requested → not_restructured (the recheck failed; nothing changes).
 */
export type ChangeRequestState = "change_requested" | "draft_amendment" | "payment_rescheduled" | "not_restructured";

export interface ChangeRequest {
  id: string;
  replyId: string;
  noticeId: string | null;
  /** The collection attempt and schedule line the reply is about. */
  attemptId: string;
  scheduleLineId: string;
  agreementVersion: number;
  phrase: string;
  unavailableUntil: CalendarDate;
  earliestDebit: CalendarDate;
  transformation: string;
  /** preventive: the debit has not been attempted; after_failed_debit: secondary path. */
  timing: "preventive" | "after_failed_debit";
  state: ChangeRequestState;
  amendmentId: string | null;
  createdAt: string;
  history: { at: string; state: ChangeRequestState; note: string }[];
}

export class RestructureError extends Error {}

/** A qualifying reply arrived while a request for the same payment is still open. */
export class ChangeRequestAlreadyOpenError extends RestructureError {
  constructor(readonly open: ChangeRequest) {
    super(
      `Change request ${open.id} is already open for this payment (${open.scheduleLineId}, version ${open.agreementVersion}: buyer wrote “${open.phrase}”, earliest debit ${open.earliestDebit}). ` +
        "This reply created no second request and did not replace the requested date; the merchant should read it.",
    );
  }
}

/** Open = not yet resolved: the request awaits a draft, or its draft awaits approvals. */
export const isOpenChangeRequest = (c: ChangeRequest) => c.state === "change_requested" || c.state === "draft_amendment";

/** The open change request under a given agreement version (earlier-version requests are stale). */
export function openChangeRequestFor(requests: ChangeRequest[], agreementVersion: number): ChangeRequest | null {
  return requests.find((c) => isOpenChangeRequest(c) && c.agreementVersion === agreementVersion) ?? null;
}

/**
 * Turn a classified buyer reply into a change request. The collection line is selected through
 * the reply's own reference: reply → advance notice → notice.attemptId → attempt.scheduleLineId.
 * A reply that answers anything other than a sent notice selects no line.
 *
 * At most one open request may exist for the same notice, attempt or schedule line under an
 * agreement version. A further qualifying reply is refused (merchant attention); it never replaces
 * the first requested date. Requests from earlier versions are stale and never block.
 */
export function createChangeRequest(args: {
  id: string;
  reply: ConversationItem;
  conversation: ConversationItem[];
  notices: AdvanceNotice[];
  attempts: CollectionAttempt[];
  activeVersion: number;
  existing: ChangeRequest[];
}): ChangeRequest {
  const { reply } = args;
  if (reply.direction !== "inbound" || reply.classification?.kind !== "change_requested") throw new RestructureError("Only a reply classified as a change request can start restructuring");
  const target = args.conversation.find((i) => i.id === reply.inReplyTo);
  if (!target || target.kind !== "notice" || !target.refs.noticeId) throw new RestructureError("The reply does not answer an advance notice, so no payment line can be selected");
  const notice = args.notices.find((n) => n.id === target.refs.noticeId);
  if (!notice || !notice.sentAt) throw new RestructureError("The referenced advance notice was not sent");
  if (Date.parse(reply.createdAt) < Date.parse(notice.sentAt)) throw new RestructureError("A reply cannot predate the notice it answers");
  const attempt = args.attempts.find((a) => a.id === notice.attemptId);
  if (!attempt) throw new RestructureError("The notice's collection attempt no longer exists");
  const open = args.existing.find(
    (c) => isOpenChangeRequest(c) && c.agreementVersion === args.activeVersion && (c.noticeId === notice.id || c.attemptId === attempt.id || c.scheduleLineId === attempt.scheduleLineId),
  );
  if (open) throw new ChangeRequestAlreadyOpenError(open);
  if (args.attempts.some((a) => a.scheduleLineId === attempt.scheduleLineId && a.status === "succeeded")) throw new RestructureError("This payment has already succeeded; it cannot be rescheduled");
  if (args.attempts.some((a) => a.status === "submitted")) throw new RestructureError("Awaiting payment outcome; rescheduling is blocked until it is known");
  if (attempt.status !== "scheduled" && attempt.status !== "failed") throw new RestructureError(`The attempt is ${attempt.status}; nothing to reschedule`);
  const c = reply.classification;
  return {
    id: args.id,
    replyId: reply.id,
    noticeId: notice.id,
    attemptId: attempt.id,
    scheduleLineId: attempt.scheduleLineId,
    agreementVersion: args.activeVersion,
    phrase: c.phrase,
    unavailableUntil: c.unavailableUntil,
    earliestDebit: c.earliestDebit,
    transformation: c.transformation,
    timing: attempt.status === "scheduled" ? "preventive" : "after_failed_debit",
    state: "change_requested",
    amendmentId: null,
    createdAt: reply.createdAt,
    history: [{ at: reply.createdAt, state: "change_requested", note: `Buyer wrote “${c.phrase}”` }],
  };
}

const NEXT: Record<ChangeRequestState, ChangeRequestState[]> = {
  change_requested: ["draft_amendment", "not_restructured"],
  draft_amendment: ["payment_rescheduled", "not_restructured"],
  payment_rescheduled: [],
  not_restructured: [],
};

export function transitionChangeRequest(c: ChangeRequest, to: ChangeRequestState, at: string, note: string, amendmentId?: string): ChangeRequest {
  if (!NEXT[c.state].includes(to)) throw new RestructureError(`Change request cannot move from ${c.state} to ${to}`);
  return { ...c, state: to, amendmentId: amendmentId ?? c.amendmentId, history: [...c.history, { at, state: to, note }] };
}
