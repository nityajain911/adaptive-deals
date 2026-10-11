import Link from "next/link";
import { StageShell } from "@/components/deal/stage-shell";
import { OutcomeCard } from "@/components/outcome-card";
import { loadDeal } from "@/lib/deal-page";
import { performanceView } from "@/lib/performance-view";

export const metadata = { title: "Performance · Adaptive Deals" };

/** Performance tab: what the deal has produced so far and what it teaches. Kept off the active deal screens. */
export default async function PerformancePage(props: PageProps<"/deals/[dealId]/performance">) {
  const { dealId } = await props.params;
  const { s, out, deal, now } = await loadDeal(dealId);
  const { summary, signals, learning } = performanceView({ s, out, deal, now });
  return (
    <StageShell dealId={dealId} viewing="track">
      <div className="space-y-4" data-testid="performance-page">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[20px] font-bold tracking-tight text-ink">Performance</h2>
          <Link href={`/deals/${dealId}/track`} className="text-[14px] font-semibold text-blue hover:underline" data-testid="back-to-deal">
            ← Back to the deal
          </Link>
        </div>
        <OutcomeCard summary={summary} signals={signals} learning={learning} />
      </div>
    </StageShell>
  );
}
