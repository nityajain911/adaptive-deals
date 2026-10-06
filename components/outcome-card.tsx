import { fmtTime } from "@/components/evidence";
import { Badge, Card, Stat } from "@/components/ui";
import { formatINR } from "@/domain/money";
import { approxINR } from "@/lib/offer-copy";
import { formatDate } from "@/domain/dates";
import type { OutcomeSummary } from "@/lib/outcome";

export const LEARNING_POLICY =
  "Outcomes across eligible stalled deals are reviewed to propose versioned improvements to recommendations and templates. Changes are evaluated before release. Merchant rules and policies never change automatically. If a proposed template or policy change affects a merchant's permitted commercial structures, it requires merchant approval before use.";

export interface OutcomeSignal {
  id: string;
  label: string;
  at: string;
}

export function OutcomeCard({ summary, signals }: { summary: OutcomeSummary; signals: OutcomeSignal[] }) {
  return (
    <Card className="p-5" data-testid="outcome-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">Outcome and learning</div>
          <h2 className="mt-1 text-[17px] font-semibold text-ink">Provisional through {formatDate(summary.inputs.cutoff.slice(0, 10))}</h2>
        </div>
        <Badge tone="amber">{summary.label}</Badge>
      </div>

      <div className="tabular mt-3 text-[28px] font-semibold tracking-tight text-ink" data-testid="provisional-contribution">
        {formatINR(summary.provisionalContributionPaise)}
      </div>
      <p className="mt-1 max-w-3xl text-[13px] leading-5 text-muted">
        This is not a final realised-contribution result because refund data, actual payment fees and committed future costs are unavailable in the prototype.
      </p>
      <p className="mt-2 text-[13px] text-ink-2">Target metric: realised contribution within 90 days per eligible stalled deal.</p>

      {summary.fullContractForecastContributionPaise !== null ? (
        <div className="mt-3 max-w-sm">
          <Stat label="Full-contract forecast" value={approxINR(summary.fullContractForecastContributionPaise)} hint="Based on the accepted offer's planned service dates" />
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <Stat label="Initial offer sent" value={summary.proposedTotalPaise === null ? "Not sent" : formatINR(summary.proposedTotalPaise)} hint="Including GST" />
        <Stat label="Current accepted contract" value={summary.acceptedTotalPaise === null ? "Not accepted" : formatINR(summary.acceptedTotalPaise)} hint="Including GST" />
        <Stat label="Payments recorded within the 90-day window" value={formatINR(summary.collected.totalPaise)} hint={`${formatINR(summary.collected.prePaise)} excl. GST`} />
      </div>

      <div className="mt-4 space-y-2">
        <details data-testid="outcome-calculation" className="rounded-xl border border-line px-4 py-2">
          <summary className="cursor-pointer text-[13px] font-semibold text-blue">How this was calculated</summary>
          <div className="space-y-3 py-3 text-[13px] leading-5 text-ink-2">
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-muted">Cash received excl. GST</dt>
                <dd className="font-medium text-ink">{formatINR(summary.inputs.cashPrePaise)}</dd>
              </div>
              <div>
                <dt className="text-muted">Estimated payment fees</dt>
                <dd className="font-medium text-ink">{formatINR(summary.inputs.estimatedFeesPaise)}</dd>
              </div>
              <div>
                <dt className="text-muted">Modelled direct costs incurred</dt>
                <dd className="font-medium text-ink">{formatINR(summary.inputs.costsIncurredPaise)}</dd>
              </div>
              <div>
                <dt className="text-muted">Measurement cutoff</dt>
                <dd className="font-medium text-ink">{fmtTime(summary.inputs.cutoff)}</dd>
              </div>
            </dl>
            <ul className="list-disc space-y-1 pl-5">
              {summary.disclosures.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        </details>

        {signals.length ? (
          <details data-testid="outcome-signals" className="rounded-xl border border-line px-4 py-2">
            <summary className="cursor-pointer text-[13px] font-semibold text-blue">What happened in this deal</summary>
            <ol className="space-y-2 py-3 text-[13px] text-ink-2">
              {signals.map((signal) => (
                <li key={signal.id}>
                  <span className="font-medium text-ink">{signal.label}</span> · {fmtTime(signal.at)}
                </li>
              ))}
            </ol>
          </details>
        ) : null}

        <details data-testid="outcome-learning" className="rounded-xl border border-line px-4 py-2">
          <summary className="cursor-pointer text-[13px] font-semibold text-blue">How outcomes improve recommendations</summary>
          <p className="py-3 text-[13px] leading-5 text-ink-2">{LEARNING_POLICY}</p>
        </details>
      </div>
    </Card>
  );
}
