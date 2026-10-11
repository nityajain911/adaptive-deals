import Link from "next/link";
import type { DealProgress } from "@/lib/progress";
import { statusPipeline } from "@/lib/status-pipeline";
import { Badge, type Tone } from "../ui";

const WAITING: Record<DealProgress["kind"], [Tone, string]> = {
  action_required: ["amber", "Your move"],
  waiting_on_buyer: ["blue", "Waiting on buyer"],
  waiting_on_system: ["neutral", "Waiting on payment"],
  informational: ["green", "Up to date"],
  terminal: ["neutral", "Closed"],
};

/** The merchant's open deal as one status row: who it is with, where it stands, what happens next. */
export function OpenDealRow({ buyer, progress, dealId }: { buyer: string; progress: DealProgress; dealId: string }) {
  const [tone, label] = progress.kind === "terminal" && progress.stages[progress.stage] === "completed" ? (["green", "Completed"] as [Tone, string]) : WAITING[progress.kind];
  const step = statusPipeline(progress).find((item) => item.current)?.label ?? "";
  return (
    <section aria-label="Your open deal" data-testid="open-deal-row">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Your open deal</h2>
      <Link href={`/deals/${dealId}/${progress.stage}`} className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface px-5 py-4 shadow-[var(--shadow-card)] hover:border-[#c7d3ff]" data-testid="deals-open-deal">
        <span className="text-[16px] font-semibold text-ink [overflow-wrap:anywhere] sm:min-w-[160px]">{buyer}</span>
        <Badge tone={tone}>{label}</Badge>
        <span className="min-w-0 basis-full text-[14px] text-ink-2 [overflow-wrap:anywhere] sm:flex-1 sm:basis-0">{step ? `${step} · ` : ""}{progress.headline}</span>
        <span className="text-[14px] font-semibold text-blue">Open deal →</span>
      </Link>
    </section>
  );
}
