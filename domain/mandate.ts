import { compareDates } from "./dates";
import type { MandateTerms } from "./agreement";
import type { Paise } from "./money";

export type MandateStatus = "pending" | "confirmed" | "revoked" | "expired";
export type IntegrationMode = "real_test" | "simulated";

export interface Mandate {
  id: string;
  agreementId: string;
  agreementVersion: number;
  method: "emandate" | "upi_autopay" | "card";
  perDebitLimitPaise: Paise;
  endDate: string;
  status: MandateStatus;
  mode: IntegrationMode;
}

export function createMandate(args: { id: string; agreementId: string; agreementVersion: number; terms: MandateTerms; method?: Mandate["method"]; mode: IntegrationMode }): Mandate {
  return {
    id: args.id,
    agreementId: args.agreementId,
    agreementVersion: args.agreementVersion,
    method: args.method ?? "emandate",
    perDebitLimitPaise: args.terms.perDebitLimitPaise,
    endDate: args.terms.endDate.value,
    status: "pending",
    mode: args.mode,
  };
}

const MANDATE_TRANSITIONS: Record<MandateStatus, MandateStatus[]> = {
  pending: ["confirmed", "revoked", "expired"],
  confirmed: ["revoked", "expired"],
  revoked: [],
  expired: [],
};

export function transitionMandate(m: Mandate, to: MandateStatus): Mandate {
  if (!MANDATE_TRANSITIONS[m.status].includes(to)) throw new Error(`Mandate cannot move from ${m.status} to ${to}`);
  return { ...m, status: to };
}

export type MandateFitReason = "WITHIN_PER_DEBIT_LIMIT" | "ABOVE_PER_DEBIT_LIMIT" | "BEFORE_END_DATE" | "AFTER_END_DATE" | "MANDATE_NOT_CONFIRMED";

export interface MandateFit {
  fits: boolean;
  reasons: { code: MandateFitReason; lineId: string | null; amountPaise?: Paise; dueDate?: string }[];
  /** True when the revision needs fresh buyer authorisation of a new mandate. */
  freshAuthorisationRequired: boolean;
}

/** Whether revised recurring debits stay inside the authorised per-debit limit, validity and status. */
export function checkMandateFit(m: Mandate, debits: { lineId: string; dueDate: string; totalPaise: Paise }[]): MandateFit {
  const reasons: MandateFit["reasons"] = [];
  let fits = true;
  if (m.status !== "confirmed") {
    fits = false;
    reasons.push({ code: "MANDATE_NOT_CONFIRMED", lineId: null });
  }
  for (const d of debits) {
    const amountOk = d.totalPaise <= m.perDebitLimitPaise;
    const dateOk = compareDates(d.dueDate, m.endDate) <= 0;
    reasons.push({ code: amountOk ? "WITHIN_PER_DEBIT_LIMIT" : "ABOVE_PER_DEBIT_LIMIT", lineId: d.lineId, amountPaise: d.totalPaise });
    reasons.push({ code: dateOk ? "BEFORE_END_DATE" : "AFTER_END_DATE", lineId: d.lineId, dueDate: d.dueDate });
    if (!amountOk || !dateOk) fits = false;
  }
  return { fits, reasons, freshAuthorisationRequired: !fits };
}
