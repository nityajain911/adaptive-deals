import type { AgreementVersion } from "@/domain/agreement";
import type { CollectionAttempt } from "@/domain/collections";
import { addDays } from "@/domain/dates";
import { sum } from "@/domain/money";

export interface ContractFinancialView {
  state: "proposed" | "declined" | "accepted";
  stateLabel: string;
  contractTotalPaise: number;
  contractPrePaise: number;
  contractGstPaise: number;
  collectedPaise: number;
  collectedPrePaise: number;
  collectedGstPaise: number;
  remainingPaise: number | null;
  remainingPrePaise: number | null;
  remainingGstPaise: number | null;
  nextPayment: { amountPaise: number; dueDate: string; status: "scheduled" | "submitted" } | null;
  windowedCollectedPaise: number;
  cutoff: string;
  windowEnded: boolean;
  windowExplanation: string;
}

function addCalendarDaysToIso(iso: string, days: number): string {
  if (Number.isNaN(Date.parse(iso))) throw new Error(`Invalid timestamp "${iso}"`);
  const match = /^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))$/.exec(iso);
  if (!match) throw new Error(`Timestamp must be an ISO instant with an explicit timezone: "${iso}"`);
  return `${addDays(match[1], days)}${match[2]}`;
}

export function measurementCutoff(eligibleAt: string, now: string): { cutoff: string; windowEnded: boolean } {
  if (Number.isNaN(Date.parse(now))) throw new Error(`Invalid timestamp "${now}"`);
  const windowEnd = addCalendarDaysToIso(eligibleAt, 90);
  const windowEnded = Date.parse(now) >= Date.parse(windowEnd);
  return { cutoff: windowEnded ? windowEnd : now, windowEnded };
}

function succeededAt(a: CollectionAttempt): string | null {
  if (a.status !== "succeeded") return null;
  return a.history.find((h) => h.status === "succeeded")?.at ?? null;
}

/** Financial facts for the current contract, separate from the 90-day outcome metric. */
export function contractFinancialView(args: { agreement: AgreementVersion; attempts: CollectionAttempt[]; eligibleAt: string; now: string }): ContractFinancialView {
  const { agreement, eligibleAt, now } = args;
  const state: ContractFinancialView["state"] = agreement.status === "buyer_rejected" ? "declined" : agreement.buyerAcceptance ? "accepted" : "proposed";
  const stateLabel = state === "accepted" ? "Accepted contract" : state === "declined" ? "No accepted contract recorded in Adaptive Deals" : "Proposed schedule · no accepted contract recorded";
  const lineIds = new Set(agreement.terms.paymentSchedule.map((line) => line.id));
  const successful = state === "accepted" ? args.attempts.filter((a) => a.agreementId === agreement.agreementId && lineIds.has(a.scheduleLineId) && a.status === "succeeded") : [];
  const paidByLine = [...new Map(successful.map((a) => [a.scheduleLineId, a])).values()];
  const collectedPaise = sum(paidByLine.map((a) => a.amountPaise));
  const collectedPrePaise = sum(paidByLine.map((a) => a.prePaise));
  const collectedGstPaise = sum(paidByLine.map((a) => a.gstPaise));
  const { cutoff, windowEnded } = measurementCutoff(eligibleAt, now);
  const windowed = paidByLine.filter((a) => {
    const at = succeededAt(a);
    return at !== null && Date.parse(at) <= Date.parse(cutoff);
  });
  const windowedCollectedPaise = sum(windowed.map((a) => a.amountPaise));
  const next = state === "accepted"
    ? args.attempts
        .filter((a) => a.agreementId === agreement.agreementId && lineIds.has(a.scheduleLineId) && (a.status === "scheduled" || a.status === "submitted"))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
    : undefined;
  return {
    state,
    stateLabel,
    contractTotalPaise: agreement.terms.pricing.totalPaise,
    contractPrePaise: agreement.terms.pricing.prePaise,
    contractGstPaise: agreement.terms.pricing.gstPaise,
    collectedPaise,
    collectedPrePaise,
    collectedGstPaise,
    remainingPaise: state === "accepted" ? Math.max(0, agreement.terms.pricing.totalPaise - collectedPaise) : null,
    remainingPrePaise: state === "accepted" ? Math.max(0, agreement.terms.pricing.prePaise - collectedPrePaise) : null,
    remainingGstPaise: state === "accepted" ? Math.max(0, agreement.terms.pricing.gstPaise - collectedGstPaise) : null,
    nextPayment: next ? { amountPaise: next.amountPaise, dueDate: next.dueDate, status: next.status as "scheduled" | "submitted" } : null,
    windowedCollectedPaise,
    cutoff,
    windowEnded,
    windowExplanation: windowedCollectedPaise < collectedPaise ? "Some verified payments were received after the 90-day cutoff and are excluded from the outcome window." : "All operationally collected payments shown here fall within the current outcome window.",
  };
}
