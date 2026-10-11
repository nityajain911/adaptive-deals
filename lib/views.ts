import type { AgreementVersion, CanonicalTerms } from "@/domain/agreement";
import type { ConversationItem } from "@/domain/conversation";
import { formatDate } from "@/domain/dates";
import type { ExplanationResult } from "@/ai/explain";
import { formatINR } from "@/domain/money";
import type { ChangeRequest } from "@/domain/restructure";
import type { MerchantPolicy, ServicePackage } from "@/domain/types";
import type { CollectionAttempt } from "@/domain/collections";
import type { ReplyClassification } from "@/domain/replies";
import { isResolvingDisposition, type DeliveryRecord, type HandledMessage, type WorkDisposition, type WorkSourceKind } from "./deal-records";
import { branchCause, type DecisionBranch } from "./decision-branch";
import type { ModelProvenance } from "./model-provenance";

/**
 * Pure view derivations shared by the merchant and buyer pages. Nothing here changes state;
 * every figure comes from stored state or canonical terms.
 */

export const activeVersionOf = (agreements: AgreementVersion[]) => [...agreements].reverse().find((v) => v.status === "active") ?? null;

/** Latest buyer-accessible descendant of a historical agreement version. */
export function latestReplacementVersion(agreements: AgreementVersion[], originalVersion: number): AgreementVersion | null {
  let cursor = originalVersion;
  let replacement: AgreementVersion | null = null;
  const visited = new Set<number>([cursor]);
  while (true) {
    const next = agreements
      .filter((version) => version.supersedes === cursor && version.status !== "draft" && version.status !== "merchant_approved")
      .sort((a, b) => b.version - a.version)[0];
    if (!next || visited.has(next.version)) return replacement;
    replacement = next;
    cursor = next.version;
    visited.add(cursor);
  }
}

export type UnresolvedWorkKind = "buyer_request" | "conflicting_evidence" | "not_restructured" | "follow_up_pending";

export interface UnresolvedWorkItem {
  kind: UnresolvedWorkKind;
  sourceKind: WorkSourceKind;
  sourceId: string;
  version: number;
  text: string;
  detail: string;
  occurredAt: string;
  note: string | null;
  dateAmbiguity: boolean;
}

type WorkState = {
  agreements: AgreementVersion[];
  deliveries: DeliveryRecord[];
  conversation: ConversationItem[];
  changeRequests: ChangeRequest[];
  attempts: CollectionAttempt[];
  handledMessages: HandledMessage[];
  workDispositions: WorkDisposition[];
  events: { kind: string; title: string; detail: string | null; at: string }[];
};

const resolving = isResolvingDisposition;

const EXACT_DATE_REASONS = new Set(["unsupported_date_expression", "multiple_dates", "same_day_ambiguous"]);
export const replyNeedsExactDate = (classification: ReplyClassification | null) => classification?.kind === "needs_attention" && EXACT_DATE_REASONS.has(classification.reason);

/** Current-version buyer work which still needs an explicit merchant disposition. */
export function unresolvedWork(s: WorkState): UnresolvedWorkItem[] {
  const activeVersion = activeVersionOf(s.agreements)?.version ?? null;
  const deliveredVersion = s.deliveries.filter((d) => d.deliveredAt !== null).at(-1)?.version ?? null;
  const currentVersion = deliveredVersion ?? activeVersion;
  if (currentVersion === null) return [];
  const dispositionFor = (sourceKind: WorkSourceKind, sourceId: string) => [...s.workDispositions].reverse().find((d) => d.sourceKind === sourceKind && d.sourceId === sourceId);
  const applyDisposition = (item: UnresolvedWorkItem): UnresolvedWorkItem | null => {
    const d = dispositionFor(item.sourceKind, item.sourceId);
    if (d && resolving(d.kind)) return null;
    if (d?.kind === "follow_up_pending") return { ...item, kind: "follow_up_pending", note: d.note, occurredAt: d.at };
    return item;
  };
  const out: UnresolvedWorkItem[] = [];

  for (const message of s.conversation) {
    if (message.direction !== "inbound" || message.kind !== "change_request" || message.refs.agreementVersion !== currentVersion) continue;
    const item = applyDisposition({
      kind: "buyer_request",
      sourceKind: "message",
      sourceId: message.id,
      version: currentVersion,
      text: message.text,
      detail: "They asked for a change. Your offer stays as it is until you decide.",
      occurredAt: message.createdAt,
      note: null,
      dateAmbiguity: false,
    });
    if (item) out.push(item);
  }

  for (const request of s.changeRequests) {
    if (request.agreementVersion !== activeVersion || request.state !== "not_restructured") continue;
    const reply = s.conversation.find((m) => m.id === request.replyId);
    const item = applyDisposition({
      kind: "not_restructured",
      sourceKind: "change_request",
      sourceId: request.id,
      version: request.agreementVersion,
      text: reply?.text ?? request.phrase,
      detail: "The requested date did not pass the confirmed checks. The original payment remains scheduled.",
      occurredAt: request.history.at(-1)?.at ?? request.createdAt,
      note: null,
      dateAmbiguity: false,
    });
    if (item) out.push(item);
  }

  for (const message of s.conversation) {
    if (message.direction !== "inbound" || !message.inReplyTo || message.classification?.kind === "acknowledgement") continue;
    const target = s.conversation.find((m) => m.id === message.inReplyTo);
    if (target?.kind !== "notice" || !target.refs.attemptId) continue;
    const attempt = s.attempts.find((a) => a.id === target.refs.attemptId);
    if (!attempt || attempt.agreementVersion !== activeVersion) continue;
    const ownsRequest = s.changeRequests.some((r) => r.replyId === message.id);
    const handled = s.handledMessages.find((h) => h.messageId === message.id);
    const isConflict = message.classification?.kind === "change_requested" && !ownsRequest;
    if (!isConflict && !handled) continue;
    const outcome = noticeReplyOutcome(message, s, activeVersion);
    const item = applyDisposition({
      kind: handled ? "follow_up_pending" : "conflicting_evidence",
      sourceKind: "message",
      sourceId: message.id,
      version: activeVersion!,
      text: message.text,
      detail: outcome?.detail ?? NO_REQUEST_NEUTRAL,
      occurredAt: handled?.handledAt ?? message.createdAt,
      note: handled?.note ?? null,
      dateAmbiguity: replyNeedsExactDate(message.classification),
    });
    if (item) out.push(item);
  }

  return out.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
}

// ── Change requests ─────────────────────────────────────────────────────────

export type ChangeRequestDisplay =
  | { kind: "open"; label: "Change requested" | "Draft amendment" }
  | { kind: "closed"; label: "Payment rescheduled" | "Not restructured" }
  | { kind: "stale"; label: string };

/**
 * How a change request is shown. An unresolved request from an earlier agreement version is
 * stale: never open or actionable, and shown as superseded by the active version.
 */
export function changeRequestDisplay(c: ChangeRequest, activeVersion: number | null): ChangeRequestDisplay {
  if (c.state === "payment_rescheduled") return { kind: "closed", label: "Payment rescheduled" };
  if (c.state === "not_restructured") return { kind: "closed", label: "Not restructured" };
  if (activeVersion !== null && c.agreementVersion !== activeVersion) return { kind: "stale", label: `Superseded by agreement version ${activeVersion}` };
  return { kind: "open", label: c.state === "change_requested" ? "Change requested" : "Draft amendment" };
}

/** Change requests the merchant can act on now: unresolved and under the active version. */
export function actionableChangeRequests(requests: ChangeRequest[], agreements: AgreementVersion[]): ChangeRequest[] {
  const active = activeVersionOf(agreements);
  return active ? requests.filter((c) => c.state === "change_requested" && changeRequestDisplay(c, active.version).kind === "open") : [];
}

export interface ReplyOutcome {
  label: string;
  tone: "blue" | "green" | "red" | "amber" | "neutral";
  detail: string;
  changeRequestId: string | null;
}

export const NO_REQUEST_NEUTRAL = "No change request created; review the timeline for details.";

/**
 * What actually happened to a buyer reply to an advance notice. "Change requested" (or its later
 * state) appears only when a request was created from this reply. Otherwise the reply needed
 * merchant attention, and the reason shown is the one recorded at the time, when it can be linked
 * reliably: the service records the reply's own event and, immediately after it in the same
 * action, the refusal. If that link is not unique, neutral wording is used instead.
 */
export function noticeReplyOutcome(
  reply: Pick<ConversationItem, "id" | "text" | "createdAt" | "inReplyTo" | "classification">,
  s: { changeRequests: ChangeRequest[]; events: { kind: string; title: string; detail: string | null; at: string }[] },
  activeVersion: number | null,
): ReplyOutcome | null {
  const c = reply.classification;
  if (!c) return null;
  if (c.kind === "payment_claimed") return { label: "Payment claimed — verification required", tone: "neutral", detail: "Payment status and the ledger change only from a verified payment event.", changeRequestId: null };
  if (c.kind === "acknowledgement") return { label: "Acknowledgement only", tone: "neutral", detail: "Accepts nothing and authorises nothing.", changeRequestId: null };
  if (c.kind === "needs_attention") return { label: "Merchant attention needed", tone: "amber", detail: c.detail, changeRequestId: null };
  const cr = s.changeRequests.find((x) => x.replyId === reply.id);
  if (cr) {
    const d = changeRequestDisplay(cr, activeVersion);
    return { label: d.label, tone: d.label === "Payment rescheduled" ? "green" : d.label === "Not restructured" ? "red" : d.kind === "stale" ? "neutral" : "blue", detail: `“${c.phrase}” → unavailable through ${c.unavailableUntil}, earliest debit ${c.earliestDebit}`, changeRequestId: cr.id };
  }
  const own = s.events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.kind === "buyer_message" && e.at === reply.createdAt && e.title === `Buyer: “${reply.text}”` && !!reply.inReplyTo && (e.detail ?? "").includes(`reply to notice ${reply.inReplyTo}`));
  const next = own.length === 1 ? s.events[own[0].i + 1] : undefined;
  const reason = next && next.kind === "merchant_attention" && next.detail ? next.detail : NO_REQUEST_NEUTRAL;
  return { label: "Merchant attention needed", tone: "amber", detail: reason, changeRequestId: null };
}

export interface PendingActions {
  draftsToSend: number;
  changeRequests: number;
  revisionsToApprove: number;
  total: number;
}

/** Merchant to-dos. Stale change requests are never counted. */
export function pendingActions(s: { conversation: ConversationItem[]; changeRequests: ChangeRequest[]; agreements: AgreementVersion[]; amendments: { state: string }[] }): PendingActions {
  const draftsToSend = s.conversation.filter((i) => i.direction === "outbound" && !i.sentAt).length;
  const changeRequests = actionableChangeRequests(s.changeRequests, s.agreements).length;
  const revisionsToApprove = s.amendments.filter((a) => a.state === "proposed").length;
  return { draftsToSend, changeRequests, revisionsToApprove, total: draftsToSend + changeRequests + revisionsToApprove };
}

// ── Attribution ─────────────────────────────────────────────────────────────

/**
 * Accurate attribution for the recommendation card. `source.text` is the source of the reason
 * shown on this card, and `comparison` is the source of the full comparison. A model is named
 * only for what a model produced, and never for a comparison that code wrote.
 */
export function explanationAttribution(
  source: ExplanationResult["source"] | null,
  provenance: ModelProvenance,
  branch: DecisionBranch | null = null,
  comparison: ExplanationResult["source"]["text"] = source?.text ?? "code_fallback",
  /** The merchant chose this option over the recommendation: the model is credited only for the reason it wrote. */
  selectedByMerchant = false,
): string {
  if (branch) return `Recalculated by the engine after ${branchCause(branch)} · explanation written by code.`;
  const ranked = source?.ranking === "ai";
  const reasoned = source?.text === "ai";
  if (!source) return "Explanation written by code · all figures calculated by the engine";
  if (selectedByMerchant) {
    if (!reasoned) return "You selected this option · explanation written by code · all figures calculated by the engine";
    const clause = comparison === "code_fallback" ? " Full comparison written by code." : "";
    const reason = provenance.modelMade ? `${provenance.providerName} wrote this reason · you selected this option · ${provenance.label.replace(/^./, (c) => c.toLowerCase())}` : "Sample reason written by hand · no model ran · you selected this option";
    return `${reason} · figures calculated by the engine.${clause}`;
  }
  if (!ranked && !reasoned) return "Explanation written by code · all figures calculated by the engine · Order set by code";
  const who = provenance.modelMade ? provenance.providerName : null;
  const origin = who ? provenance.label.replace(/^./, (c) => c.toLowerCase()) : "no model ran";
  // Ranked only: the reason on the card is code-written.
  if (!reasoned) return who ? `${who} ranked · code explained · ${origin} · all figures calculated by the engine` : `Sample order written by hand · ${origin} · code explained · all figures calculated by the engine`;
  const subject = who ? (ranked ? `${who} ranked and wrote this reason` : `${who} wrote this reason · order set by code`) : ranked ? "Sample order and reason written by hand" : "Sample reason written by hand";
  const order = who || ranked ? "" : " · order set by code";
  return `${subject} · ${origin}${order} · figures calculated by the engine.${comparison === "code_fallback" ? " Full comparison written by code." : ""}`;
}

// ── Buyer proposal ──────────────────────────────────────────────────────────

export interface ProposalPaymentRow {
  id: string;
  date: string;
  dueDate: string;
  method: string;
  prePaise: number;
  gstPaise: number;
  totalPaise: number;
}

export interface ProposalView {
  version: number;
  included: { packageId: string; name: string; detail: string }[];
  excluded: { packageId: string; name: string }[];
  totalPaise: number;
  prePaise: number;
  gstPaise: number;
  gstRatePercent: string;
  payments: ProposalPaymentRow[];
  recurring: { perDebitLimitPaise: number; endDate: string; debitCount: number; noticeDays: number } | null;
  delivery: { from: string; to: string; lines: number };
  nextSteps: string[];
  authorityRequired: boolean;
  authorityReason: "phase_scope" | "required_approval" | null;
}

export type BuyerProposalLifecycleState =
  | "awaiting_response"
  | "waiting_on_merchant"
  | "setup_pending"
  | "payment_scheduled"
  | "payment_pending"
  | "retry_scheduled"
  | "paid"
  | "declined"
  | "superseded";

export interface BuyerProposalLifecycle {
  state: BuyerProposalLifecycleState;
  headline: string;
  detail: string;
  nextHeading: string;
  setupBasis: "proposed" | "actual" | "historical";
  showResponseActions: boolean;
  replacementVersion: number | null;
}

/** Buyer-facing lifecycle truth for one delivered agreement version. */
export function buyerProposalLifecycle(args: {
  agreement: Pick<AgreementVersion, "status" | "version">;
  hasBuyerRequest: boolean;
  paymentLinkStatus: "created" | "partially_paid" | "paid" | "expired" | "cancelled" | null;
  mandateStatus: "pending" | "confirmed" | "revoked" | "expired" | null;
  attempts: { status: "scheduled" | "submitted" | "succeeded" | "failed" | "removed"; dueDate: string; origin?: "agreement" | "internal_retry" | "amendment" }[];
  fullyPaid?: boolean;
  replacementVersion: number | null;
  isRevision?: boolean;
}): BuyerProposalLifecycle {
  const { agreement } = args;
  const base = { replacementVersion: args.replacementVersion };
  if (agreement.status === "superseded") {
    return { ...base, state: "superseded", headline: `Version ${agreement.version} is historical`, detail: args.replacementVersion ? `It was replaced by version ${args.replacementVersion}.` : "It is no longer the current version.", nextHeading: "Version history", setupBasis: "historical", showResponseActions: false };
  }
  if (agreement.status === "buyer_rejected") {
    return { ...base, state: "declined", headline: "Proposal declined", detail: "No payment setup was created for this version.", nextHeading: "What happened", setupBasis: "historical", showResponseActions: false };
  }
  if (args.hasBuyerRequest) {
    return { ...base, state: "waiting_on_merchant", headline: "Waiting for Pinecone Media Works", detail: "Your change request was sent. This version stays unchanged while the merchant reviews it.", nextHeading: "While you wait", setupBasis: "proposed", showResponseActions: false };
  }
  if (agreement.status === "sent") {
    return { ...base, state: "awaiting_response", headline: "Review and respond", detail: "You pay on this page right after you accept.", nextHeading: "After you accept", setupBasis: "proposed", showResponseActions: true };
  }

  const link = args.paymentLinkStatus === "paid" ? "payment link paid" : args.paymentLinkStatus === "partially_paid" ? "payment link partly paid" : args.paymentLinkStatus ? "payment link waiting to be paid" : "no payment link needed";
  const mandate = args.mandateStatus === "confirmed" ? "automatic payments set up" : args.mandateStatus === "pending" ? "automatic payments waiting to be set up" : args.mandateStatus ? `automatic payments ${args.mandateStatus}` : "no automatic payments needed";
  if (args.fullyPaid) {
    return { ...base, state: "paid", headline: "Payments complete", detail: `${link} · ${mandate}. `, nextHeading: "Current status", setupBasis: "actual", showResponseActions: false };
  }
  const retry = args.attempts.filter((a) => a.status === "scheduled" && a.origin === "internal_retry").sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  if (retry) {
    return { ...base, state: "retry_scheduled", headline: `Retry scheduled for ${formatDate(retry.dueDate)}`, detail: `${link} · ${mandate}. The failed attempt stays in the history.`, nextHeading: "Current status", setupBasis: "actual", showResponseActions: false };
  }
  const submitted = args.attempts.find((a) => a.status === "submitted");
  if (submitted) {
    return { ...base, state: "payment_pending", headline: "Waiting for the payment result", detail: `${link} · ${mandate}. The payment has been sent and is not confirmed yet.`, nextHeading: "Current status", setupBasis: "actual", showResponseActions: false };
  }
  const scheduled = args.attempts.filter((a) => a.status === "scheduled").sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  if (scheduled) {
    return { ...base, state: "payment_scheduled", headline: `Next payment scheduled for ${formatDate(scheduled.dueDate)}`, detail: `${link} · ${mandate}.`, nextHeading: "Current status", setupBasis: "actual", showResponseActions: false };
  }
  return { ...base, state: "setup_pending", headline: args.isRevision ? "Revised terms accepted" : "Proposal accepted", detail: `${link} · ${mandate}.`, nextHeading: "Current status", setupBasis: "actual", showResponseActions: false };
}

const monthLabel = (ym: string) => formatDate(`${ym}-01`).replace(/^1 /, "");

/** The buyer proposal, derived only from canonical agreement terms (plus package names). */
export function proposalView(v: Pick<AgreementVersion, "version" | "terms">, packages: Pick<ServicePackage, "id" | "name" | "kind">[], policy: Pick<MerchantPolicy, "advanceNoticeDays">): ProposalView {
  const t: CanonicalTerms = v.terms;
  const name = (id: string) => packages.find((p) => p.id === id)?.name ?? id;
  const payments = t.paymentSchedule.map((p) => ({
    id: p.id,
    dueDate: p.dueDate.value,
    date: formatDate(p.dueDate.value),
    method: p.method === "payment_link" ? "Pay online (link)" : "Automatic payment",
    prePaise: p.prePaise,
    gstPaise: p.gstPaise,
    totalPaise: p.totalPaise,
  }));
  const recurringLines = t.paymentSchedule.filter((p) => p.method === "recurring_debit");
  const link = t.paymentSchedule.find((p) => p.method === "payment_link");
  const nextSteps = [
    link ? `You pay ${formatINR(link.totalPaise)} on this page right after you accept.` : null,
    t.mandate && recurringLines.length
      ? `In the same step you authorise automatic payments of up to ${formatINR(t.mandate.perDebitLimitPaise)} each, until ${formatDate(t.mandate.endDate.value)}. ${recurringLines.length === 1 ? "The later payment is" : "Later payments are"} taken on the dates above, and we remind you ${policy.advanceNoticeDays} days before.`
      : null,
    `Work starts ${formatDate(`${t.deliverySchedule[0].month.value}-01`)}.`,
    "If a date does not work for you, tell us when you get the reminder. Nothing changes until you accept a new version.",
  ].filter((x): x is string => !!x);
  return {
    version: v.version,
    included: t.scope.map((s) => {
      const kind = packages.find((p) => p.id === s.packageId)?.kind;
      return { packageId: s.packageId, name: name(s.packageId), detail: kind === "monthly" ? `${s.months} month${s.months === 1 ? "" : "s"}` : "One-time" };
    }),
    excluded: t.excludedPackageIds.map((id) => ({ packageId: id, name: name(id) })),
    totalPaise: t.pricing.totalPaise,
    prePaise: t.pricing.prePaise,
    gstPaise: t.pricing.gstPaise,
    gstRatePercent: `${t.pricing.gstRateBps / 100}%`,
    payments,
    recurring: t.mandate && recurringLines.length ? { perDebitLimitPaise: t.mandate.perDebitLimitPaise, endDate: formatDate(t.mandate.endDate.value), debitCount: recurringLines.length, noticeDays: policy.advanceNoticeDays } : null,
    delivery: { from: monthLabel(t.deliverySchedule[0].month.value), to: monthLabel(t.deliverySchedule.at(-1)!.month.value), lines: t.deliverySchedule.length },
    nextSteps,
    authorityRequired: t.conditions.includes("buyer_confirms_authority_for_phase_scope") || t.conditions.includes("buyer_attests_required_approval"),
    authorityReason: t.conditions.includes("buyer_attests_required_approval") ? "required_approval" : t.conditions.includes("buyer_confirms_authority_for_phase_scope") ? "phase_scope" : null,
  };
}

/** Parse the `v<n>` proposal segment. */
export function parseVersionSegment(seg: string): number | null {
  const m = /^v([1-9]\d{0,3})$/.exec(seg);
  return m ? Number(m[1]) : null;
}
