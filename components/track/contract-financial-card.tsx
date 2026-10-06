import { formatDate } from "@/domain/dates";
import { formatINR } from "@/domain/money";
import type { ContractFinancialView } from "@/lib/financial-view";
import { Card, Stat } from "@/components/ui";

/** Operational contract facts. This is deliberately separate from the 90-day outcome metric. */
export function ContractFinancialCard({ view }: { view: ContractFinancialView }) {
  if (view.state !== "accepted") {
    return (
      <Card className="p-5" data-testid="contract-financial-card">
        <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">Contract status</div>
        <h2 className="mt-1 text-[17px] font-semibold text-ink">{view.stateLabel}</h2>
        <p className="mt-2 text-[13px] text-ink-2">Proposed total: {formatINR(view.contractTotalPaise)} including GST. It is retained as history and is not shown as an amount owed.</p>
      </Card>
    );
  }
  return (
    <Card className="p-5" data-testid="contract-financial-card">
      <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">Current accepted contract</div>
      <h2 className="mt-1 text-[17px] font-semibold text-ink">Remaining under the accepted contract</h2>
      <div className="tabular mt-2 text-[30px] font-bold tracking-tight text-ink" data-testid="contract-remaining">
        {formatINR(view.remainingPaise ?? 0)} <span className="text-[13px] font-medium text-muted">including GST</span>
      </div>
      {view.nextPayment ? (
        <p className="mt-1 text-[13px] font-medium text-ink-2">Next payment: {formatINR(view.nextPayment.amountPaise)} on {formatDate(view.nextPayment.dueDate)} · {view.nextPayment.status === "submitted" ? "awaiting outcome" : "scheduled"}.</p>
      ) : (
        <p className="mt-1 text-[13px] font-medium text-ink-2">No future payment is currently scheduled.</p>
      )}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Stat label="Accepted contract total" value={formatINR(view.contractTotalPaise)} hint="Including GST" />
        <Stat label="Collected against contract" value={formatINR(view.collectedPaise)} hint={`${formatINR(view.collectedPrePaise)} excl. GST`} />
        <Stat label="GST still to collect" value={formatINR(view.remainingGstPaise ?? 0)} hint="Part of the remaining total" />
      </div>
    </Card>
  );
}
