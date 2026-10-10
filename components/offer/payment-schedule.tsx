import { addMonths, formatDate } from "@/domain/dates";
import { formatINR } from "@/domain/money";
import type { PaymentLine } from "@/domain/structures";

type Payment = Pick<PaymentLine, "totalPaise" | "dueDate">;

/** Short overview, with every contractual amount and date still available. */
export function OfferPaymentSchedule({ payments }: { payments: Payment[] }) {
  const ordered = [...payments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (ordered.length <= 2) return <div className="text-[14px] text-ink-2" data-testid="offer-payments">
    {ordered.length === 1 ? "One payment" : `${ordered.length} payments`}: {ordered.map((p) => `${formatINR(p.totalPaise)} on ${formatDate(p.dueDate)}`).join(", ")}
  </div>;
  const first = ordered[0];
  const last = ordered.at(-1)!;
  const monthly = ordered.every((p, i) => p.dueDate === addMonths(first.dueDate, i));
  const amounts = ordered.map((p) => p.totalPaise);
  const low = Math.min(...amounts);
  const high = Math.max(...amounts);
  return <div className="space-y-1 text-[14px] text-ink-2" data-testid="offer-payments">
    <p className="font-medium text-ink">{ordered.length}{monthly ? " monthly" : ""} payments{low === high ? ` of ${formatINR(low)}` : ` · ${formatINR(low)}–${formatINR(high)} each`}</p>
    <p>{formatDate(first.dueDate)} – {formatDate(last.dueDate)}</p>
    <details data-testid="offer-payment-schedule" className="pt-1">
      <summary className="cursor-pointer font-semibold text-blue">View payment schedule</summary>
      <ol className="mt-2 divide-y divide-line rounded-lg border border-line px-3">
        {ordered.map((p, i) => <li key={`${p.dueDate}-${i}`} className="flex items-center justify-between gap-3 py-2">
          <time dateTime={p.dueDate}>{formatDate(p.dueDate)}</time>
          <span className="tabular font-medium text-ink">{formatINR(p.totalPaise)}</span>
        </li>)}
      </ol>
    </details>
  </div>;
}
