import Link from "next/link";
import type { DealProgress, StageId, StageStatus } from "@/lib/progress";
import { cx } from "../ui";

const STAGES: [StageId, string][] = [
  ["understand", "Understand the buyer"],
  ["offer", "Review the offer"],
  ["track", "Track the deal"],
];
const WORD: Record<StageStatus, string> = { done: "Done", current: "Current", upcoming: "Upcoming", closed: "Closed", completed: "Completed" };

/** Three merchant stages; the current one is derived from domain state, never from page visits. */
export function StageTracker({ progress, dealId }: { progress: DealProgress; dealId: string }) {
  return (
    <nav aria-label="Deal stages" className="mt-4" data-testid="stage-tracker">
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {STAGES.map(([id, label], i) => {
          const st = progress.stages[id];
          const current = st === "current" || ((st === "closed" || st === "completed") && progress.stage === id);
          return (
            <li key={id}>
              <Link
                href={`/deals/${dealId}/${id}`}
                aria-current={current ? "step" : undefined}
                data-stage={id}
                data-status={st}
                className={cx(
                  "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[14px] font-semibold",
                  current ? "border-blue bg-blue-weak text-ink" : st === "done" ? "border-line bg-surface text-ink-2" : "border-dashed border-line-strong bg-surface text-muted",
                )}
              >
                <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px]", current ? "bg-blue text-white" : st === "done" ? "bg-green-weak text-green" : "bg-[#eef0f3] text-ink-2")}>{st === "done" ? "✓" : i + 1}</span>
                <span className="min-w-0 flex-1">{label}</span>
                <span className="text-[12px] font-medium text-muted">{WORD[st]}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
