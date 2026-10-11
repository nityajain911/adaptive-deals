import Link from "next/link";
import type { DealProgress } from "@/lib/progress";
import { statusPipeline } from "@/lib/status-pipeline";
import { cx } from "../ui";

/**
 * One compact horizontal status line. Each step is a dot plus words, so meaning never rests on colour alone.
 * The current step is derived from domain state, never from page visits.
 */
export function StageTracker({ progress, dealId }: { progress: DealProgress; dealId: string }) {
  const steps = statusPipeline(progress);
  const position = Math.max(1, steps.findIndex((step) => step.id === progress.stage) + 1);
  return (
    <nav aria-label="Deal stages" className="mt-4" data-testid="stage-tracker">
      <p className="mb-1.5 text-[12px] font-medium text-muted sm:hidden" data-testid="stage-position">Step {position} of {steps.length}</p>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-xl border border-line bg-surface px-3 py-2 sm:gap-2">
        {steps.map((step, i) => (
          <li key={step.id} className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            {i > 0 ? <span aria-hidden className={cx("hidden h-px w-3 shrink-0 sm:block sm:w-8", step.status === "upcoming" ? "bg-line-strong" : "bg-green/60")} /> : null}
            <Link
              href={`/deals/${dealId}/${step.id}`}
              aria-current={step.current ? "step" : undefined}
              data-stage={step.id}
              data-status={step.status}
              className={cx("flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 text-[13px] sm:text-[14px]", step.current ? "bg-blue-weak font-semibold text-ink" : step.status === "done" ? "text-ink-2" : "text-muted")}
            >
              <span
                aria-hidden
                className={cx(
                  "h-2.5 w-2.5 shrink-0 rounded-full border-2",
                  step.current ? "border-blue bg-blue [animation:step-dot_1.6s_ease-in-out_3]" : step.status === "done" ? "border-green bg-green" : "border-line-strong bg-surface",
                  step.current && step.status === "closed" ? "border-ink-2 bg-ink-2" : "",
                )}
              />
              <span>{step.label}</span>
              <span className="sr-only">{step.current ? " (current step)" : step.status === "done" ? " (done)" : " (not reached yet)"}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
