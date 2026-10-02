import type { CheckResult } from "@/domain/checks";
import { explainCheck } from "@/domain/copy";
import { formatDate } from "@/domain/dates";
import type { EvaluatedStructure } from "@/domain/engine";
import { formatINR, sum } from "@/domain/money";
import { Badge, Table, cx } from "./ui";

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
      hideOnMobile={[1]}
      head={["Due", "Method", "Excl. GST", "GST", "Total"]}
      rows={[
        ...p.map((l) => [<span key="d" className="whitespace-nowrap">{formatDate(l.dueDate)}</span>, l.method === "payment_link" ? "Payment link" : "Recurring debit", formatINR(l.prePaise), formatINR(l.gstPaise), <strong key="t">{formatINR(l.totalPaise)}</strong>]),
        [<strong key="l">Total</strong>, "", formatINR(sum(p.map((l) => l.prePaise))), formatINR(sum(p.map((l) => l.gstPaise))), <strong key="t">{formatINR(sum(p.map((l) => l.totalPaise)))}</strong>],
      ]}
    />
  );
}
