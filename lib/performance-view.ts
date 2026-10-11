import type { Structure } from "@/domain/structures";
import { formatINR } from "@/domain/money";
import type { OutcomeSignal } from "@/components/outcome-card";
import { BUYER_DECLINE_REASONS, MERCHANT_CLOSE_REASONS, type BuyerDeclineReason, type MerchantCloseReason } from "./deal-records";
import { learningEvidence, type LearningEvidence } from "./learning-evidence";
import { outcomeSummary, type OutcomeSummary } from "./outcome";
import type { DealContext } from "@/ai/orchestrator";
import type { DemoState } from "./service";
import { activeVersionOf } from "./views";

type Outcome = Awaited<ReturnType<typeof import("./service").currentOutcome>>;

export interface PerformanceView {
  summary: OutcomeSummary;
  signals: OutcomeSignal[];
  learning: LearningEvidence;
}

/** What the Performance tab shows, derived only from stored state. The active deal screen keeps just `performanceLine`. */
export function performanceView(args: { s: DemoState; out: Outcome; deal: DealContext; now: string }): PerformanceView {
  const { s, out, deal, now } = args;
  const active = activeVersionOf(s.agreements);
  const latestDelivered = s.deliveries.filter((d) => d.deliveredAt).at(-1);
  const shown = s.agreements.find((v) => v.version === (active?.version ?? latestDelivered?.version));
  let shownStructure: Structure | null = null;
  if (shown) {
    const x = s.amendments.find((a) => a.toVersion === shown.version)?.revised ?? out.evaluation.result?.structures.find((e) => e.structure.id === shown.structureId);
    if (x) shownStructure = x.structure;
  }
  const summary = outcomeSummary({ s, acceptedStructure: shown?.buyerAcceptance ? shownStructure : null, policy: deal.merchant.policy, now, timeZone: deal.merchant.timeZone });

  const signals: OutcomeSignal[] = s.outcomes.map((o) => {
    let label: string;
    if (o.type === "buyer_accepted") label = `Buyer accepted version ${o.version}`;
    else if (o.type === "buyer_requested_change") label = `Buyer requested a change to version ${o.version}`;
    else if (o.type === "buyer_declined") label = `Buyer declined${o.reasonCode ? ` · ${BUYER_DECLINE_REASONS[o.reasonCode as BuyerDeclineReason]}` : ""}`;
    else if (o.type === "merchant_closed") label = `Merchant closed the deal${o.reasonCode ? ` · ${MERCHANT_CLOSE_REASONS[o.reasonCode as MerchantCloseReason]}` : ""}`;
    else label = "Merchant selected an alternative offer";
    return { id: o.id, label, at: o.at };
  });
  for (const e of s.events.filter((x) => ["payment_succeeded", "debit_failed", "payment_rescheduled"].includes(x.kind))) signals.push({ id: e.id, label: e.title, at: e.at });
  signals.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const learning = learningEvidence({ selectedOption: s.selectedOption, counterOffers: s.counterOffers, economics: s.economics, agreements: s.agreements, amendments: s.amendments, changeRequests: s.changeRequests, collectedPaise: summary.collected.totalPaise });
  return { summary, signals, learning };
}

/** One honest line for the deal screen. A ₹0 figure is never shown: nothing collected reads as nothing collected. */
export function performanceLine(summary: OutcomeSummary): string {
  if (summary.collected.totalPaise <= 0) return summary.acceptedTotalPaise === null ? "Nothing collected yet. The buyer has not accepted." : "Nothing collected yet.";
  return `${formatINR(summary.collected.totalPaise)} collected so far`;
}
