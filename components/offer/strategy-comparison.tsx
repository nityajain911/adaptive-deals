import { formatINR, sum } from "@/domain/money";
import type { EvaluatedStructure } from "@/domain/engine";
import { STRATEGY_IDS, STRATEGY_LABEL, strategyView, type StrategyId } from "@/domain/strategy";
import type { DealBaseline } from "@/domain/deal-baseline";
import { approxINR, headlineFor } from "@/lib/offer-copy";
import { cx } from "../ui";

/** What each strategy would recommend for this deal, computed by code from the same feasible offers. */
export function StrategyComparison({ feasible, baseline, current }: { feasible: EvaluatedStructure[]; baseline: DealBaseline; current: StrategyId }) {
  const rows = STRATEGY_IDS.map((id) => ({ id, view: strategyView(feasible, id, baseline) }));
  return (
    <section aria-label="What each strategy would recommend" data-testid="strategy-comparison">
      <h3 className="text-[13px] font-semibold text-ink">What changes under another strategy</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
              <th className="py-1.5 pr-3">Strategy</th>
              <th className="py-1.5 pr-3">Leading offer</th>
              <th className="hidden py-1.5 pr-3 text-right sm:table-cell">Total</th>
              <th className="hidden py-1.5 pr-3 text-right sm:table-cell">You keep</th>
              <th className="hidden py-1.5 sm:table-cell">Buyer approval</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, view }) => {
              const x = view.leader;
              return (
                <tr key={id} data-testid={`strategy-row-${id}`} data-current={id === current ? "true" : undefined} className={cx("border-b border-line last:border-0", id === current && "bg-blue-weak font-medium")}>
                  <th scope="row" className="py-1.5 pr-3 text-left font-semibold text-ink">{STRATEGY_LABEL[id]}{id === current ? " · current" : ""}</th>
                  <td className="py-1.5 pr-3 text-ink">
                    {x ? headlineFor(x) : "No offer"}
                    {x ? <span className="mt-0.5 block text-ink-2 sm:hidden">{formatINR(sum(x.structure.payments.map((p) => p.totalPaise)))} · you keep {approxINR(x.economics.netContributionPaise)} · {x.approval === "requires_approval" ? "Needs MD approval" : "Within limit"}</span> : null}
                  </td>
                  <td className="tabular hidden py-1.5 pr-3 text-right sm:table-cell">{x ? formatINR(sum(x.structure.payments.map((p) => p.totalPaise))) : "—"}</td>
                  <td className="tabular hidden py-1.5 pr-3 text-right sm:table-cell">{x ? approxINR(x.economics.netContributionPaise) : "—"}</td>
                  <td className="hidden py-1.5 text-ink-2 sm:table-cell">{x ? (x.approval === "requires_approval" ? "Needs MD approval" : "Within limit") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
