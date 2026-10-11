import { formatDate, parseDate, type CalendarDate } from "./dates";
import { formatINR } from "./money";

/**
 * What a buyer asks for when they request a change to a proposal, as structured data the merchant can act
 * on. The sentence the merchant reads is built from this, never the other way round, so the amount, the
 * services or the date in the message always match what was asked.
 */
export type ChangeRequestDetail =
  | { kind: "price"; targetPaise: number; gstBasis: "including" | "excluding" }
  | { kind: "scope"; packageIds: string[] }
  | { kind: "date"; lineId: string; date: CalendarDate }
  | { kind: "other" };

export interface ChangeRequestContext {
  /** The offer's total including GST. */
  currentTotalPaise: number;
  /** Every service the merchant sells, in catalogue order. */
  services: { id: string; name: string }[];
  /** The services in the current offer. */
  includedIds: string[];
  /** The offer's payments, in order. */
  lines: { id: string; date: CalendarDate; totalPaise: number }[];
  /** The buyer's today, from the (possibly simulated) clock. */
  today: CalendarDate;
  gstRateBps: number;
}

const list = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** The amount the buyer named, expressed as a total including GST. */
export function targetTotalIncludingGst(detail: Extract<ChangeRequestDetail, { kind: "price" }>, gstRateBps: number): number {
  return detail.gstBasis === "including" ? detail.targetPaise : Math.round(detail.targetPaise * (1 + gstRateBps / 10_000));
}

/** A plain reason the request cannot be sent as it stands, or null when it is fine. */
export function validateChangeRequest(detail: ChangeRequestDetail, ctx: ChangeRequestContext): string | null {
  if (detail.kind === "price") {
    if (!Number.isInteger(detail.targetPaise) || detail.targetPaise <= 0) return "Enter the amount you have in mind.";
    if (targetTotalIncludingGst(detail, ctx.gstRateBps) >= ctx.currentTotalPaise) return `Choose an amount lower than the current ${formatINR(ctx.currentTotalPaise)}.`;
    return null;
  }
  if (detail.kind === "scope") {
    const known = new Set(ctx.services.map((s) => s.id));
    if (!detail.packageIds.length) return "Choose at least one service to include.";
    if (!detail.packageIds.every((id) => known.has(id))) return "One of the services is not part of this offer.";
    const same = detail.packageIds.length === ctx.includedIds.length && ctx.includedIds.every((id) => detail.packageIds.includes(id));
    return same ? "Change at least one service, or choose another kind of request." : null;
  }
  if (detail.kind === "date") {
    const line = ctx.lines.find((l) => l.id === detail.lineId);
    if (!line) return "Choose which payment you would like to move.";
    try {
      parseDate(detail.date);
    } catch {
      return "Enter a valid date.";
    }
    if (detail.date <= ctx.today) return "Choose a date after today.";
    if (detail.date === line.date) return "That is already the date of this payment.";
    return null;
  }
  return null;
}

/** The message the merchant reads. A note, when given, follows the request. */
export function describeChangeRequest(detail: ChangeRequestDetail, note: string, ctx: ChangeRequestContext): string {
  const tail = note.trim() ? ` ${note.trim()}` : "";
  if (detail.kind === "price") return `Could you do ${formatINR(detail.targetPaise)} ${detail.gstBasis === "including" ? "including" : "excluding"} GST?${tail}`;
  if (detail.kind === "scope") {
    const names = detail.packageIds.map((id) => ctx.services.find((s) => s.id === id)?.name ?? id);
    return `Could we change what's included to ${list(names)}?${tail}`;
  }
  if (detail.kind === "date") {
    const line = ctx.lines.find((l) => l.id === detail.lineId);
    return `Could the ${line ? formatDate(line.date) : "next"} payment move to ${formatDate(detail.date)}?${tail}`;
  }
  return note.trim();
}
