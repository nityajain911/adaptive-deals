import { fmtTime } from "@/components/evidence";
import { Card, Stat } from "@/components/ui";
import { formatINR } from "@/domain/money";

export function ClosedSummary({
  proposedTotalPaise,
  reason,
  note,
  closedAt,
}: {
  proposedTotalPaise: number | null;
  reason: string | null;
  note: string | null;
  closedAt: string | null;
}) {
  return (
    <Card className="p-5" data-testid="offer-closed">
      <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">Outcome summary</div>
      <h2 className="mt-1 text-[18px] font-semibold text-ink">Closed in Adaptive Deals{reason ? ` · ${reason}` : ""}</h2>
      {note ? <p className="mt-1 text-[13px] text-ink-2">“{note}”</p> : null}
      {closedAt ? <p className="mt-1 text-[13px] text-muted">{fmtTime(closedAt)} · nothing was sent to the buyer.</p> : null}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Stat label="Proposed value" value={proposedTotalPaise === null ? "Not prepared" : formatINR(proposedTotalPaise)} hint="Including GST" />
        <Stat label="Accepted contract" value="Not accepted" />
      </div>
      <p className="mt-4 text-[13px] font-medium text-ink">Payments recorded in Adaptive Deals: ₹0.</p>
      <p className="mt-1 text-[13px] text-muted">This does not establish that no money was received elsewhere.</p>
      <p className="mt-3 text-[13px] text-ink-2">Measurement: Included — the denominator counts every eligible stalled deal, including deals that never sign.</p>
    </Card>
  );
}
