import { formatINR } from "@/domain/money";
import type { DealTransformation } from "@/lib/deal-transformation";

export function DealTransformationCard({ value }: { value: DealTransformation }) {
  return (
    <section className="grid gap-3 border-b border-line bg-surface-muted px-5 py-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch" aria-label="Original quote compared with adaptive offer" data-testid="deal-transformation">
      <TransformationColumn title="Original quote" total={value.original.totalPaise} scope={value.original.scopeLabel} duration={value.original.durationLabel} approval={value.original.approvalLabel} />
      <div className="hidden items-center text-center text-[20px] text-blue md:flex" aria-hidden>→</div>
      <TransformationColumn title="Adaptive offer" total={value.adaptive.totalPaise} scope={value.adaptive.scopeLabel} duration={value.adaptive.durationLabel} approval={value.adaptive.approvalLabel} recommended />
      {value.economicsChanged ? <p className="md:col-span-3 text-[13px] text-ink-2">Your prices or costs changed in version {value.economicsChanged.toVersion}. This offer now keeps {formatINR(value.economicsChanged.contributionDeltaPaise)} {value.economicsChanged.contributionDeltaPaise < 0 ? "less" : "more"} after costs.</p> : null}
    </section>
  );
}

function TransformationColumn({ title, total, scope, duration, approval, recommended = false }: { title: string; total: number; scope: string; duration: string; approval: string; recommended?: boolean }) {
  return <div className={recommended ? "rounded-xl border border-[#c7d3ff] bg-surface p-3" : "rounded-xl border border-line bg-surface p-3"}>
    <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">{title}</div>
    <div className="mt-1 tabular text-[22px] font-bold tracking-tight text-ink">{formatINR(total)} <span className="text-[13px] font-medium text-muted">incl. GST</span></div>
    <dl className="mt-2 space-y-1 text-[14px] text-ink-2"><div><dt className="inline font-semibold text-ink">Scope: </dt><dd className="inline">{scope}</dd></div><div><dt className="inline font-semibold text-ink">Timing: </dt><dd className="inline">{duration}</dd></div><div><dt className="inline font-semibold text-ink">Approval: </dt><dd className="inline">{approval}</dd></div></dl>
  </div>;
}
