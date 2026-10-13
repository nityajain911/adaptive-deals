import { formatINR, sum } from "@/domain/money";
import type { EvaluatedStructure } from "@/domain/engine";
import { STRATEGY_IDS, STRATEGY_LABEL, strategyView, type StrategyId } from "@/domain/strategy";
import type { DealBaseline } from "@/domain/deal-baseline";
import { approxINR, headlineFor } from "@/lib/offer-copy";
import { cx } from "../ui";

/** Strategies that lead with the same offer, in the order shown: each later one points back to the first. */
export function sameLeaderNotes(rows: { id: StrategyId; leaderId: string | null }[]): Partial<Record<StrategyId, StrategyId>> {
  const first = new Map<string, StrategyId>();
  const notes: Partial<Record<StrategyId, StrategyId>> = {};
  for (const row of rows) {
    if (!row.leaderId) continue;
    const earlier = first.get(row.leaderId);
    if (earlier) notes[row.id] = earlier;
    else first.set(row.leaderId, row.id);
  }
  return notes;
}

/** What each strategy would recommend for this deal, computed by code from the same feasible offers. */
export function StrategyComparison({ feasible, baseline, current, canWait = [] }: { feasible: EvaluatedStructure[]; baseline: DealBaseline; current: StrategyId; canWait?: readonly string[] }) {
  const rows = STRATEGY_IDS.map((id) => ({ id, view: strategyView(feasible, id, baseline, canWait) }));
  const notes = sameLeaderNotes(rows.map(({ id, view }) => ({ id, leaderId: view.leader?.structure.id ?? null })));
  const distinct = new Set(rows.map(({ view }) => view.leader?.structure.id).filter(Boolean)).size;
  return (
    <section aria-label="What each strategy would recommend" data-testid="strategy-comparison">
      <h3 className="text-[13px] font-semibold text-ink">If something else mattered more</h3>
      {distinct === 1 ? <p className="mt-1 text-[13px] text-ink-2" data-testid="strategy-all-same">Whatever matters most to you, the best offer here is the same.</p> : distinct < rows.length ? <p className="mt-1 text-[13px] text-ink-2" data-testid="strategy-some-same">Some of these give the same offer, so choosing between them changes nothing here.</p> : null}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
              <th className="py-1.5 pr-3">If you chose</th>
              <th className="py-1.5 pr-3">Best offer</th>
              <th className="hidden py-1.5 pr-3 text-right sm:table-cell">Total</th>
              <th className="hidden py-1.5 pr-3 text-right sm:table-cell">You&apos;d keep</th>
              <th className="hidden py-1.5 sm:table-cell">Approval</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, view }) => {
              const x = view.leader;
              return (
                <tr key={id} data-testid={`strategy-row-${id}`} data-current={id === current ? "true" : undefined} className={cx("border-b border-line last:border-0", id === current && "bg-blue-weak font-medium")}>
                  <th scope="row" className="py-1.5 pr-3 text-left font-semibold text-ink">{STRATEGY_LABEL[id]}{id === current ? " · now" : ""}{notes[id] ? <span className="block text-[12px] font-normal text-muted" data-testid={`strategy-same-${id}`}>Same offer as {STRATEGY_LABEL[notes[id]!]}</span> : null}</th>
                  <td className="py-1.5 pr-3 text-ink">
                    {x ? headlineFor(x) : "No offer"}
                    {x ? <span className="mt-0.5 block text-ink-2 sm:hidden">{formatINR(sum(x.structure.payments.map((p) => p.totalPaise)))} · you&apos;d keep {approxINR(x.economics.netContributionPaise)} · {x.approval === "requires_approval" ? "Needs their MD" : "Within their limit"}</span> : null}
                  </td>
                  <td className="tabular hidden py-1.5 pr-3 text-right sm:table-cell">{x ? formatINR(sum(x.structure.payments.map((p) => p.totalPaise))) : "—"}</td>
                  <td className="tabular hidden py-1.5 pr-3 text-right sm:table-cell">{x ? approxINR(x.economics.netContributionPaise) : "—"}</td>
                  <td className="hidden py-1.5 text-ink-2 sm:table-cell">{x ? (x.approval === "requires_approval" ? "Needs their MD" : "Within their limit") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
