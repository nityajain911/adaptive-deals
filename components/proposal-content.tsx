import { CalendarClock, CircleCheck, Repeat } from "lucide-react";
import { formatINR } from "@/domain/money";
import type { ProposalView } from "@/lib/views";
import { cx } from "./ui";

/**
 * The buyer-facing proposal content, rendered only from canonical terms (spec §5.6). Shared by the
 * buyer page and the merchant preview so both show exactly the same scope, totals, dates, mandate
 * requirement and consequences. Contains no actions and no merchant-only information.
 */
export function ProposalContent({ view, nextHeading, nextSteps, changedLineId = null }: { view: ProposalView; nextHeading: string; nextSteps: string[]; changedLineId?: string | null }) {
  return (
    <div className="space-y-5" data-testid="proposal-content">
      <section aria-labelledby="scope">
        <h2 id="scope" className="text-[13px] font-semibold uppercase tracking-wide text-muted">
          What&apos;s included
        </h2>
        <ul className="mt-2 space-y-1.5" data-testid="included">
          {view.included.map((i) => (
            <li key={i.packageId} className="flex items-start justify-between gap-3 text-[14px]">
              <span className="flex items-start gap-2 text-ink">
                <CircleCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-green" />
                {i.name}
              </span>
              <span className="shrink-0 text-muted">{i.detail}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[12px] text-muted">
          Delivery {view.delivery.from} – {view.delivery.to}
        </p>
      </section>
      {view.excluded.length ? (
        <section aria-labelledby="excluded">
          <h2 id="excluded" className="text-[13px] font-semibold uppercase tracking-wide text-muted">
            Not included
          </h2>
          <p className="mt-1 text-[14px] text-ink" data-testid="excluded">
            {view.excluded.map((e) => e.name).join(", ")}
          </p>
          <p className="mt-1 text-[12px] text-muted">This is a separate purchase with its own value. Anything later follows your normal approval process.</p>
        </section>
      ) : null}

      <section aria-labelledby="total" className="rounded-xl bg-surface-muted px-4 py-3">
        <h2 id="total" className="text-[13px] font-semibold text-ink-2">
          Total including GST
        </h2>
        <div className="tabular mt-0.5 text-[28px] font-bold tracking-tight text-ink" data-testid="buyer-total">
          {formatINR(view.totalPaise)}
        </div>
        <div className="tabular text-[12px] text-muted">
          {formatINR(view.prePaise)} + GST {view.gstRatePercent} {formatINR(view.gstPaise)}
        </div>
        <div className="mt-1 text-[12px] font-semibold text-green" data-testid="no-financing">
          No additional financing charge added by the seller.
        </div>
      </section>

      <section aria-labelledby="payments">
        <h2 id="payments" className="text-[13px] font-semibold uppercase tracking-wide text-muted">
          Payments
        </h2>
        <ol className="mt-2 divide-y divide-line rounded-xl border border-line" data-testid="buyer-payments">
          {view.payments.map((p) => (
            <li key={p.id} className={cx("flex items-center justify-between gap-3 px-4 py-3", changedLineId === p.id && "bg-blue-weak")}>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-ink">{p.date}</div>
                <div className="text-[12px] text-muted">{p.method}</div>
              </div>
              <div className="tabular text-right">
                <div className="text-[15px] font-semibold text-ink">{formatINR(p.totalPaise)}</div>
                <div className="text-[11px] text-muted">incl. GST {formatINR(p.gstPaise)}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {view.recurring ? (
        <section aria-labelledby="recurring" className="flex gap-3 rounded-xl border border-line px-4 py-3">
          <Repeat aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-blue" />
          <div>
            <h2 id="recurring" className="text-[14px] font-semibold text-ink">
              Recurring authorisation
            </h2>
            <p className="mt-0.5 text-[13px] leading-5 text-ink-2" data-testid="recurring">
              An e-mandate of up to {formatINR(view.recurring.perDebitLimitPaise)} per debit, ending {view.recurring.endDate}. You get a reminder {view.recurring.noticeDays} days before each debit. <span className="text-muted">(Simulated in this prototype.)</span>
            </p>
          </div>
        </section>
      ) : null}

      {view.authorityReason ? (
        <section aria-label="Approval requirement" className="rounded-xl border border-line px-4 py-3 text-[13px] text-ink-2" data-testid="authority-requirement">
          {view.authorityReason === "required_approval"
            ? "Accepting requires confirming the required internal approval has been obtained. Adaptive Deals does not verify the approver's identity."
            : "Accepting requires confirming you are authorised to purchase this standalone scope."}
        </section>
      ) : null}

      <section aria-labelledby="next">
        <h2 id="next" className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-muted">
          <CalendarClock aria-hidden className="h-3.5 w-3.5" /> {nextHeading}
        </h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] leading-5 text-ink-2" data-testid="next-steps">
          {nextSteps.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
