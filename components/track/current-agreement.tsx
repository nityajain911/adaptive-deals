import { formatDate } from "@/domain/dates";
import { formatINR } from "@/domain/money";
import type { CurrentAgreementSummary } from "@/lib/current-agreement";
import { Badge, Card, Stat } from "@/components/ui";

const kindLabel = { proposed: "Proposed", accepted: "Accepted", declined: "Declined" } as const;
const headingLabel = { proposed: "Proposed offer", accepted: "Current agreement", declined: "Declined offer" } as const;
const scopeLabel = { proposed: "Proposed scope", accepted: "Agreed scope", declined: "Offered scope" } as const;

/** One compact source of truth for scope, contract money and buyer setup. */
export function CurrentAgreement({ summary }: { summary: CurrentAgreementSummary }) {
  const f = summary.financial;
  return (
    <Card className="overflow-hidden" data-testid="current-agreement">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">{headingLabel[summary.kind]} · version {summary.version}</div>
          <h2 className="mt-1 text-[18px] font-semibold text-ink">{summary.title}</h2>
          <p className="mt-1 text-[13px] text-ink-2">Service period: {summary.servicePeriod}</p>
        </div>
        <Badge tone={summary.kind === "accepted" ? "green" : summary.kind === "declined" ? "red" : "blue"}>{kindLabel[summary.kind]}</Badge>
      </div>
      <div className="grid gap-5 px-5 py-4 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{scopeLabel[summary.kind]}</h3>
          <ul className="mt-2 space-y-1 text-[13px] text-ink" data-testid="current-agreement-scope">
            {summary.included.map((line) => <li key={line}>✓ {line}</li>)}
          </ul>
          {summary.excluded.length ? <p className="mt-2 text-[13px] text-muted">Not included: {summary.excluded.join(", ")}.</p> : null}
          {summary.laterWorkStatement ? <p className="mt-1 text-[13px] font-medium text-ink-2">{summary.laterWorkStatement}</p> : null}
          <p className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-[13px] text-ink-2" data-testid="agreement-readiness">{summary.readiness}</p>
        </div>
        <div>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{summary.kind === "accepted" ? "Contract payments" : "Offer value"}</h3>
          {summary.kind === "accepted" ? (
            <>
              <div className="tabular mt-2 text-[27px] font-bold tracking-tight text-ink" data-testid="contract-remaining">{formatINR(f.remainingPaise ?? 0)}</div>
              <div className="text-[13px] text-muted">remaining including GST</div>
              {f.nextPayment ? <p className="mt-2 text-[13px] text-ink-2">Next: {formatINR(f.nextPayment.amountPaise)} on {formatDate(f.nextPayment.dueDate)} · {f.nextPayment.status === "submitted" ? "awaiting outcome" : "scheduled"}.</p> : <p className="mt-2 text-[13px] text-ink-2">No future payment is currently scheduled.</p>}
            </>
          ) : <p className="mt-2 text-[13px] text-ink-2">Proposed total: {formatINR(f.contractTotalPaise)} including GST. This is not shown as money owed.</p>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label={summary.kind === "accepted" ? "Accepted total" : "Proposed total"} value={formatINR(f.contractTotalPaise)} hint="Including GST" />
            <Stat label="Verified collected" value={formatINR(f.collectedPaise)} hint="Against this contract" />
          </div>
          {summary.kind === "accepted" ? <p className="mt-2 text-[13px] leading-5 text-muted" data-testid="outcome-window-explanation">{f.windowExplanation}</p> : null}
        </div>
      </div>
    </Card>
  );
}
