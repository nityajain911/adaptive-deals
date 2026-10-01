import { formatDate } from "@/domain/dates";
import type { EconomicsPoint } from "@/domain/economics";
import { formatINR } from "@/domain/money";

/**
 * Cash at risk over time: the funding-requirement series (one hue), with the merchant's
 * cash-at-risk limit as a labelled reference line. Bars have native hover titles; a table
 * view carries the same numbers for screen readers and print.
 */
export function FundingChart({ series, limitPaise, id }: { series: EconomicsPoint[]; limitPaise: number; id: string }) {
  const pts = series.filter((p, i) => i === 0 || p.fundingRequirementPaise !== series[i - 1].fundingRequirementPaise || p.date.endsWith("-01"));
  const max = Math.max(limitPaise, ...pts.map((p) => p.fundingRequirementPaise), 1) * 1.15;
  const W = 320;
  const H = 96;
  const bw = Math.max(4, Math.min(16, (W - 8) / pts.length - 2));
  const step = (W - 8) / pts.length;
  const y = (v: number) => H - 14 - (v / max) * (H - 24);
  const peak = Math.max(...pts.map((p) => p.fundingRequirementPaise));
  return (
    <figure className="m-0" aria-labelledby={`${id}-cap`}>
      <figcaption id={`${id}-cap`} className="text-[12px] font-semibold text-ink-2">
        Cash at risk over time <span className="font-normal text-muted">(funding requirement, excl. GST)</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-auto w-full" role="img" aria-label={`Funding requirement peaks at ${formatINR(peak)} against a ${formatINR(limitPaise)} limit`}>
        <line x1="0" x2={W} y1={H - 14} y2={H - 14} stroke="var(--border-strong)" strokeWidth="1" />
        <line x1="0" x2={W} y1={y(limitPaise)} y2={y(limitPaise)} stroke="var(--muted)" strokeWidth="1" strokeDasharray="4 3" />
        <text x={W - 2} y={y(limitPaise) - 3} textAnchor="end" fontSize="9" fill="var(--muted)">
          Limit {formatINR(limitPaise)}
        </text>
        {pts.map((p, i) => {
          const h = Math.max(0, H - 14 - y(p.fundingRequirementPaise));
          const x = 4 + i * step + (step - bw) / 2;
          return (
            <g key={p.date}>
              <rect x={x - 2} y={0} width={bw + 4} height={H - 14} fill="transparent">
                <title>{`${formatDate(p.date)}: ${formatINR(p.fundingRequirementPaise)}`}</title>
              </rect>
              {h > 0 ? <rect x={x} y={H - 14 - h} width={bw} height={h} rx="2" fill="var(--blue)" pointerEvents="none" /> : <rect x={x} y={H - 15} width={bw} height={1} fill="var(--border-strong)" pointerEvents="none" />}
            </g>
          );
        })}
        <text x="2" y={H - 2} fontSize="9" fill="var(--muted)">
          {formatDate(pts[0].date)}
        </text>
        <text x={W - 2} y={H - 2} fontSize="9" textAnchor="end" fill="var(--muted)">
          {formatDate(pts.at(-1)!.date)}
        </text>
      </svg>
      {peak === 0 ? <p className="mt-1 text-[12px] text-green">No cash at risk: payments arrive before the costs they cover.</p> : null}
      <details className="mt-1 text-[12px] text-muted">
        <summary className="cursor-pointer">Table view</summary>
        <table className="tabular mt-1 w-full text-left">
          <thead>
            <tr>
              <th className="font-semibold">Date</th>
              <th className="text-right font-semibold">Funding requirement</th>
              <th className="text-right font-semibold">Unpaid service value</th>
            </tr>
          </thead>
          <tbody>
            {pts.map((p) => (
              <tr key={p.date}>
                <td>{formatDate(p.date)}</td>
                <td className="text-right">{formatINR(p.fundingRequirementPaise)}</td>
                <td className="text-right">{formatINR(p.unpaidServiceValuePaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
