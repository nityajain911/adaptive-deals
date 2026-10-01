import type { AgreementVersion, CanonicalTerms } from "@/domain/agreement";
import type { ConversationItem } from "@/domain/conversation";
import { formatDate } from "@/domain/dates";
import type { ExplanationResult } from "@/ai/explain";
import { formatINR } from "@/domain/money";
import type { ChangeRequest } from "@/domain/restructure";
import type { MerchantPolicy, ServicePackage } from "@/domain/types";

/**
 * Pure view derivations shared by the merchant and buyer pages. Nothing here changes state;
 * every figure comes from stored state or canonical terms.
 */

export const activeVersionOf = (agreements: AgreementVersion[]) => [...agreements].reverse().find((v) => v.status === "active") ?? null;

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

/** Accurate attribution for the recommendation text, following the actual output source. */
export function explanationAttribution(source: ExplanationResult["source"] | null): string {
  if (!source) return "Explanation written by code · all figures calculated by the engine";
  const order = source.ranking === "ai" ? "Order suggested by AI, approval ordering enforced by code" : "Order set by code";
  if (source.text === "ai") return `Explanation written by AI · all figures calculated by the engine · ${order}`;
  return `Explanation written by code (AI wording did not pass validation) · all figures calculated by the engine · ${order}`;
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
    method: p.method === "payment_link" ? "Payment link" : "Recurring debit (e-mandate)",
    prePaise: p.prePaise,
    gstPaise: p.gstPaise,
    totalPaise: p.totalPaise,
  }));
  const recurringLines = t.paymentSchedule.filter((p) => p.method === "recurring_debit");
  const link = t.paymentSchedule.find((p) => p.method === "payment_link");
  const nextSteps = [
    link ? `You receive a payment link for ${formatINR(link.totalPaise)}, due ${formatDate(link.dueDate.value)}.` : null,
    t.mandate && recurringLines.length
      ? `You set up a recurring authorisation of up to ${formatINR(t.mandate.perDebitLimitPaise)} per debit, ending ${formatDate(t.mandate.endDate.value)}. ${recurringLines.length === 1 ? "The later payment is" : "Later payments are"} debited on the dates above, with a reminder ${policy.advanceNoticeDays} days before each one.`
      : null,
    `Work starts ${formatDate(`${t.deliverySchedule[0].month.value}-01`)}.`,
    "If a date stops working for you, reply to the reminder. Nothing changes until you accept a revised version.",
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
    authorityRequired: t.conditions.includes("buyer_confirms_authority_for_phase_scope"),
  };
}

/** Parse the `v<n>` proposal segment. */
export function parseVersionSegment(seg: string): number | null {
  const m = /^v([1-9]\d{0,3})$/.exec(seg);
  return m ? Number(m[1]) : null;
}
