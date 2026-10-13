import type { CanonicalTerms } from "./agreement";
import type { ChangeRequestDetail } from "./change-request";
import { formatDate } from "./dates";
import { heldOfferSentence, type CanonicalFollowOn } from "./follow-on";
import { formatINR } from "./money";
import type { AdvanceNotice } from "./notices";
import { classifyBuyerReply, type ReplyClassification } from "./replies";

/**
 * Simulated WhatsApp conversation between merchant and buyer. Nothing is sent automatically:
 * AI-suggested drafts become sent only by an explicit merchant action; notice, proposal,
 * payment and amendment messages are written by code from verified state; buyer replies are
 * selected (or typed) by the demo operator and classified by code.
 */
export const CHANNEL_LABEL = "WhatsApp simulated · buyer replies selected by the demo operator";

export type ConversationState =
  | "suggested_by_ai"
  | "drafted_by_code"
  | "approved_and_sent_by_merchant"
  | "sent_by_adaptive_deals"
  | "received_from_buyer";

export const STATE_LABEL: Record<ConversationState, string> = {
  suggested_by_ai: "Suggested by AI",
  drafted_by_code: "Drafted by code",
  approved_and_sent_by_merchant: "Approved and sent by merchant",
  sent_by_adaptive_deals: "Sent by Adaptive Deals",
  received_from_buyer: "Received from buyer",
};

export type ConversationKind = "clarification" | "proposal" | "notice" | "payment" | "amendment" | "review" | "buyer_reply" | "change_request" | "decline";

export interface ConversationItem {
  id: string;
  dealId: string;
  direction: "outbound" | "inbound";
  kind: ConversationKind;
  state: ConversationState;
  author: "ai" | "code" | "merchant" | "buyer";
  text: string;
  createdAt: string;
  sentAt: string | null;
  inReplyTo: string | null;
  source: "whatsapp_simulated" | "buyer_proposal_page";
  provenance: "simulated";
  /** Selected from the demo operator's pre-scripted replies (false = typed). */
  scripted: boolean | null;
  refs: { questionId?: string; edited?: boolean; noticeId?: string; agreementVersion?: number; amendmentId?: string; attemptId?: string; answerValue?: string; answerQuote?: string; reviewDecision?: "proceed" | "stop" | "changes"; reviewChange?: { removePackageId: string }; topic?: "date" | "scope" | "price" | "other"; request?: ChangeRequestDetail };
  /** Code's classification of an inbound reply (never an AI interpretation). */
  classification: ReplyClassification | null;
}

export class ConversationError extends Error {}

const isSent = (i: ConversationItem) => i.direction === "outbound" && i.sentAt !== null;

/** A clarification draft. Returns null while suggestions are paused (no new AI-authored drafts). */
export function draftClarification(args: { id: string; dealId: string; questionId: string; text: string; wording: "ai" | "code_fallback"; at: string; paused: boolean }): ConversationItem | null {
  if (args.paused && args.wording === "ai") return null;
  return {
    id: args.id,
    dealId: args.dealId,
    direction: "outbound",
    kind: "clarification",
    state: args.wording === "ai" ? "suggested_by_ai" : "drafted_by_code",
    author: args.wording === "ai" ? "ai" : "code",
    text: args.text,
    createdAt: args.at,
    sentAt: null,
    inReplyTo: null,
    source: "whatsapp_simulated",
    provenance: "simulated",
    scripted: null,
    refs: { questionId: args.questionId },
    classification: null,
  };
}

/**
 * The merchant rewrites a clarification draft before sending it. The question and what it asks about are unchanged;
 * only the words are. The text must still be fit for the buyer, and the message is marked as the merchant's own.
 */
export function editClarificationDraft(item: ConversationItem, text: string): ConversationItem {
  if (item.direction !== "outbound" || item.kind !== "clarification") throw new ConversationError("Only clarification drafts can be edited");
  if (item.sentAt) throw new ConversationError("A sent message cannot be edited");
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 5) throw new ConversationError("A question needs at least a few words");
  if (cleaned.length > 300) throw new ConversationError("A question can be at most 300 characters");
  assertBuyerSafe(cleaned);
  if (cleaned === item.text) return item;
  return { ...item, text: cleaned, author: "merchant", refs: { ...item.refs, edited: true } };
}

/** The merchant sends a draft. This is the only way a clarification leaves the merchant. */
export function merchantSend(item: ConversationItem, at: string): ConversationItem {
  if (item.direction !== "outbound" || item.kind !== "clarification") throw new ConversationError("Only clarification drafts are sent by the merchant");
  if (item.sentAt) throw new ConversationError("Already sent");
  assertBuyerSafe(item.text);
  return { ...item, state: "approved_and_sent_by_merchant", sentAt: at };
}

/** A code-authored outbound message, sent immediately, from verified state only. */
export function codeMessage(args: { id: string; dealId: string; kind: Exclude<ConversationKind, "clarification" | "buyer_reply" | "change_request" | "decline">; text: string; at: string; refs?: ConversationItem["refs"] }): ConversationItem {
  assertBuyerSafe(args.text);
  return {
    id: args.id,
    dealId: args.dealId,
    direction: "outbound",
    kind: args.kind,
    state: "sent_by_adaptive_deals",
    author: "code",
    text: args.text,
    createdAt: args.at,
    sentAt: args.at,
    inReplyTo: null,
    source: "whatsapp_simulated",
    provenance: "simulated",
    scripted: null,
    refs: args.refs ?? {},
    classification: null,
  };
}

/**
 * Record an inbound buyer message. It must answer an outbound message that was actually sent,
 * and cannot predate it. Code classifies it; nothing here changes terms, payments or the ledger.
 */
export function receiveBuyerReply(args: {
  id: string;
  dealId: string;
  text: string;
  at: string;
  inReplyTo: string;
  conversation: ConversationItem[];
  timeZone: string;
  scripted: boolean;
  kind?: "buyer_reply" | "change_request" | "decline";
  source?: ConversationItem["source"];
  refs?: ConversationItem["refs"];
}): ConversationItem {
  const target = args.conversation.find((i) => i.id === args.inReplyTo);
  if (!target) throw new ConversationError(`Reply target ${args.inReplyTo} does not exist`);
  if (!isSent(target)) throw new ConversationError("A buyer can only reply to a message that was sent");
  if (Date.parse(args.at) < Date.parse(target.sentAt!)) throw new ConversationError("A reply cannot predate the message it answers");
  const text = args.text.trim();
  if (!text) throw new ConversationError("Empty reply");
  return {
    id: args.id,
    dealId: args.dealId,
    direction: "inbound",
    kind: args.kind ?? "buyer_reply",
    state: "received_from_buyer",
    author: "buyer",
    text,
    createdAt: args.at,
    sentAt: null,
    inReplyTo: target.id,
    source: args.source ?? "whatsapp_simulated",
    provenance: "simulated",
    scripted: args.scripted,
    refs: { ...target.refs, ...(args.refs ?? {}) },
    classification: classifyBuyerReply(text, args.at, args.timeZone),
  };
}

// ── Buyer-facing text, built only from canonical terms and notices ──────────

const INTERNAL = /\b(contribution|margin|cost|costs|cash[- ]at[- ]risk|funding|floor|policy|policies|peak|profit|internal|reject(?:ed|ion)s?)\b/i;

/** Buyer-facing text must not carry internal economics, policy or rejection logic. */
export function assertBuyerSafe(text: string): void {
  const m = INTERNAL.exec(text);
  if (m) throw new ConversationError(`Buyer-facing text contains internal wording (“${m[0]}”)`);
}

export function proposalMessageText(terms: CanonicalTerms, version: number, link: string): string {
  const payments = terms.paymentSchedule.map((p) => `${formatINR(p.totalPaise)} on ${formatDate(p.dueDate.value)}`).join(", ");
  const held = terms.followOn ? ` ${heldOfferSentence(terms.followOn)}` : "";
  return `Here is our proposal (version ${version}): ${formatINR(terms.pricing.totalPaise)} including GST, paid as ${payments}.${held} Review and respond here: ${link}`;
}

/** The message the product sends on the review date: what was held, and the three things the buyer can say. */
export function reviewMessageText(held: Pick<CanonicalFollowOn, "pricing" | "heldUntil">): string {
  return `The first phase is done. Would you like to go ahead with the rest of the year? ${heldOfferSentence(held)} You can say yes, ask for a change, or stop here. Reply here.`;
}

export function noticeMessageText(n: AdvanceNotice): string {
  return `Reminder: ${formatINR(n.amountPaise)} (incl. GST) will be debited on ${formatDate(n.dueDate)} under your mandate. Reply here if this date does not work.`;
}

export function amendmentMessageText(args: { fromDate: string; toDate: string; amountPaise: number; version: number; link: string }): string {
  return `We can move the ${formatINR(args.amountPaise)} payment from ${formatDate(args.fromDate)} to ${formatDate(args.toDate)}. The amount is unchanged. Please review revised version ${args.version}: ${args.link}`;
}

export function rescheduledMessageText(args: { toDate: string; amountPaise: number }): string {
  return `Payment rescheduled: ${formatINR(args.amountPaise)} will now be debited on ${formatDate(args.toDate)}.`;
}

export function paymentLinkMessageText(args: { amountPaise: number; url: string; simulated: boolean }): string {
  return `Your upfront payment link for ${formatINR(args.amountPaise)}${args.simulated ? " (simulated)" : ""}: ${args.url}`;
}
