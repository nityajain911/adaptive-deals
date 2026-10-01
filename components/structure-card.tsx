import type { CheckResult } from "@/domain/checks";
import { explainCheck } from "@/domain/copy";
import { formatDate } from "@/domain/dates";
import type { EvaluatedStructure } from "@/domain/engine";
import { formatINR, sum } from "@/domain/money";
import { ApproveAndSend } from "./client";
import { FundingChart } from "./funding-chart";
import { Badge, Card, Pill, Table, cx } from "./ui";

const ICON: Record<CheckResult["status"], [string, string]> = {
  pass: ["✓", "text-green"],
  within_limit: ["✓", "text-green"],
  requires_approval: ["!", "text-amber"],
  needs_information: ["?", "text-amber"],
  fail: ["✕", "text-red"],
};
const STATUS_TEXT: Record<CheckResult["status"], string> = { pass: "Pass", within_limit: "Within limit", requires_approval: "Requires approval", needs_information: "Needs information", fail: "Fail" };
const CHECK_NAME: Record<string, string> = {
  buyer_budget: "Budget",
  buyer_timing: "Timing",
  buyer_approval: "Approval limit",
  buyer_required_packages: "Required packages",
  seller_contribution: "Contribution floor",
  seller_cash_at_risk: "Cash-at-risk limit",
  max_tenure: "Maximum tenure",
  smallest_instalment: "Smallest instalment",
  discount_limit: "Discount limit",
  scope_rules: "Package rules",
};

export function Checks({ title, checks }: { title: string; checks: CheckResult[] }) {
  return (
    <div>
      <h4 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{title}</h4>
      <ul className="mt-2 space-y-1.5">
        {checks.map((c, i) => {
          const [icon, color] = ICON[c.status];
          return (
            <li key={i} className="flex gap-2 text-[13px] leading-5">
              <span aria-hidden className={cx("w-4 shrink-0 text-center font-bold", color)}>
                {icon}
              </span>
              <span>
                <span className="font-semibold text-ink">{CHECK_NAME[c.id]}</span> <span className="sr-only">{STATUS_TEXT[c.status]}.</span>
                <span className="text-ink-2">{explainCheck(c)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ApprovalBadge({ approval }: { approval: EvaluatedStructure["approval"] }) {
  return approval === "requires_approval" ? <Badge tone="amber">Needs buyer&apos;s MD approval</Badge> : approval === "within_limit" ? <Badge tone="green">Within buyer&apos;s approval limit</Badge> : null;
}

export function PaymentTable({ x }: { x: EvaluatedStructure }) {
  const p = x.structure.payments;
  return (
    <Table
      caption="Payment schedule"
      head={["Due", "Method", "Excl. GST", "GST", "Total"]}
      rows={[
        ...p.map((l) => [<span key="d" className="whitespace-nowrap">{formatDate(l.dueDate)}</span>, l.method === "payment_link" ? "Payment link" : "Recurring debit", formatINR(l.prePaise), formatINR(l.gstPaise), <strong key="t">{formatINR(l.totalPaise)}</strong>]),
        [<strong key="l">Total</strong>, "", formatINR(sum(p.map((l) => l.prePaise))), formatINR(sum(p.map((l) => l.gstPaise))), <strong key="t">{formatINR(sum(p.map((l) => l.totalPaise)))}</strong>],
      ]}
    />
  );
}

export function StructureCard({ x, rank, note, actionable, limitPaise, floorBps, testId }: { x: EvaluatedStructure; rank?: number; note?: string; actionable: boolean; limitPaise: number; floorBps: number | null; testId?: string }) {
  const s = x.structure;
  const e = x.economics;
  return (
    <Card as="article" className="overflow-hidden" data-testid={testId}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {rank ? <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-[12px] font-bold text-white">{rank}</span> : null}
            <h3 className="text-[15px] font-semibold text-ink">{s.label}</h3>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {x.verdict === "feasible" ? <ApprovalBadge approval={x.approval} /> : null}
            <Pill>{s.template.replace(/_/g, " ")}</Pill>
            <Pill>Starts {formatDate(s.startDate)}</Pill>
          </div>
        </div>
        {actionable && x.approvable ? <ApproveAndSend structureId={s.id} label={s.label} /> : null}
      </div>
      <div className="grid gap-5 p-5 xl:grid-cols-2">
        <div className="space-y-4">
          {s.requirements.includes("buyer_confirms_authority_for_phase_scope") ? (
            <p className="rounded-lg bg-surface-muted px-3 py-2 text-[12px] text-ink-2">
              Phase 1 has value on its own and is its own purchase. The buyer must confirm authority to buy this scope. Remaining services are not part of this agreement; any later purchase follows the buyer&apos;s normal approval.
            </p>
          ) : null}
          {note ? <p className="text-[13px] text-ink-2">AI note: {note}</p> : null}
          <PaymentTable x={x} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Checks title="Buyer checks" checks={x.buyerChecks} />
            <Checks title="Seller checks" checks={x.sellerChecks} />
          </div>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Net contribution" value={formatINR(e.netContributionPaise)} hint={`${(e.netContributionBps / 100).toFixed(2)}% of price${floorBps !== null ? ` · floor ${floorBps / 100}%` : ""}`} />
            <Metric label="Peak funding requirement" value={formatINR(e.peakFundingPaise)} hint={e.peakFundingDate ? `on ${formatDate(e.peakFundingDate)} · limit ${formatINR(limitPaise)}` : `limit ${formatINR(limitPaise)}`} />
            <Metric label="Peak unpaid service value" value={formatINR(e.peakUnpaidServiceValuePaise)} hint="Delivered but not yet paid; separate from funding" />
            <Metric label="Delivery obligations" value={formatINR(s.pricePaise)} hint={`${s.deliveries.length} delivery lines from ${formatDate(s.startDate)}`} />
          </div>
          <div className="text-[12px] text-muted">
            Gross contribution {formatINR(e.grossContributionPaise)} = price {formatINR(e.pricePaise)} − direct costs {formatINR(e.directCostPaise)}; expected payment fees {formatINR(e.expectedFeesPaise)}.
          </div>
          <FundingChart series={e.series} limitPaise={limitPaise} id={`chart-${s.id.replace(/[^a-z0-9]/gi, "-")}`} />
        </div>
      </div>
    </Card>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-line px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="tabular text-[16px] font-semibold text-ink">{value}</div>
      <div className="text-[11px] text-muted">{hint}</div>
    </div>
  );
}
