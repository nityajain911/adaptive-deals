import Link from "next/link";
import type { DealProgress, StageId } from "@/lib/progress";
import { Badge, type Tone } from "../ui";

const TAG: Record<DealProgress["kind"], [Tone, string]> = {
  action_required: ["amber", "Action required"],
  waiting_on_buyer: ["blue", "Waiting for buyer"],
  waiting_on_system: ["neutral", "Waiting on system"],
  informational: ["green", "Up to date"],
  terminal: ["neutral", "Closed"],
};

/** One line from dealProgress. It never repeats the primary action; that lives in the stage body. */
export function StatusBanner({ progress, viewing, dealId }: { progress: DealProgress; viewing: StageId; dealId: string }) {
  const [tone, label] = progress.kind === "terminal" && progress.stages[progress.stage] === "completed" ? (["green", "Completed"] as [Tone, string]) : TAG[progress.kind];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-surface px-4 py-3" data-testid="status-banner" role="status">
      <Badge tone={tone}>{label}</Badge>
      <span className="text-[14px] font-medium text-ink" data-testid="status-headline">
        {progress.headline}
      </span>
      {viewing !== progress.stage ? (
        <Link href={`/deals/${dealId}/${progress.stage}`} className="ml-auto text-[13px] font-semibold text-blue hover:underline" data-testid="go-to-current">
          Go to current stage →
        </Link>
      ) : null}
    </div>
  );
}
