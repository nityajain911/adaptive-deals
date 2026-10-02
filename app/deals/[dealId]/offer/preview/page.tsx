import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { StageShell } from "@/components/deal/stage-shell";
import { PreviewActions } from "@/components/offer/preview-actions";
import { ProposalContent } from "@/components/proposal-content";
import { Notice } from "@/components/ui";
import { heroBuyer, heroMerchant, heroPackages } from "@/data/synthetic/hero";
import { loadDeal, stageHref } from "@/lib/deal-page";
import { proposalView } from "@/lib/views";

/**
 * Merchant preview of the exact buyer proposal (spec §5.3). Rendered from the draft's canonical
 * terms with the shared buyer content; nothing is sent until the merchant approves and sends.
 */
export default async function PreviewPage(props: PageProps<"/deals/[dealId]/offer/preview">) {
  const { dealId } = await props.params;
  const { s, progress } = await loadDeal(dealId);
  const v = s.agreements.find((a) => a.version === s.selectedOption?.draftVersion && a.status === "draft");
  if (!v || progress.stage !== "offer") redirect(stageHref(dealId, progress.stage));
  const stale = progress.primaryAction?.id === "review_updated_proposal";
  const view = proposalView(v, heroPackages, heroMerchant.policy);
  return (
    <StageShell dealId={dealId} viewing="offer">
      <div className="mx-auto max-w-[560px] space-y-4">
        <div className="rounded-xl border border-[#f7dfb4] bg-amber-weak px-4 py-2 text-[13px] font-semibold text-amber" data-testid="preview-frame">
          Preview · Not sent to the buyer
        </div>
        {stale ? <Notice tone="amber" title="The offer changed since you reviewed it.">Go back to the offer and review the updated proposal.</Notice> : null}
        <article className="rounded-2xl bg-surface p-5 shadow-[0_1px_3px_rgba(16,24,40,0.08),0_0_0_1px_var(--border)]" aria-label="Buyer proposal preview">
          <div className="mb-4 text-[13px] text-muted">
            {heroMerchant.name} · for {heroBuyer.name}
          </div>
          <ProposalContent view={view} nextHeading="After you accept" nextSteps={view.nextSteps} />
        </article>
        {stale ? null : <PreviewActions dealId={dealId} version={v.version} termsHash={v.termsHash} />}
        <details className="rounded-xl border border-line bg-surface px-4 py-2" data-testid="preview-agreement-details">
          <summary className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink">
            <Lock aria-hidden className="h-3.5 w-3.5 text-muted" /> Agreement details
          </summary>
          <dl className="space-y-1 py-2 text-[12px]">
            <dt className="text-muted">Version</dt>
            <dd className="text-ink">{v.version} (draft)</dd>
            <dt className="text-muted">Terms hash (SHA-256)</dt>
            <dd>
              <code className="break-all font-mono text-[11px] text-ink" data-testid="preview-hash">
                {v.termsHash}
              </code>
            </dd>
          </dl>
        </details>
      </div>
    </StageShell>
  );
}
