import { redirect } from "next/navigation";
import Link from "next/link";
import { Lock, MessageCircle } from "lucide-react";
import { formatINR } from "@/domain/money";
import { approxINR } from "@/lib/offer-copy";
import { BuyerViewSheet } from "@/components/offer/buyer-view-sheet";
import { proposalMessageText } from "@/domain/conversation";
import { StageShell } from "@/components/deal/stage-shell";
import { PreviewActions } from "@/components/offer/preview-actions";
import { EvidenceReview } from "@/components/offer/evidence-review";
import { ProposalContent } from "@/components/proposal-content";
import { Notice } from "@/components/ui";
import { loadDeal, stageHref } from "@/lib/deal-page";
import { proposalView } from "@/lib/views";
import { proposalLinkOf } from "@/lib/track-links";

/**
 * Merchant preview of the exact buyer proposal (spec §5.3). Rendered from the draft's canonical
 * terms with the shared buyer content; nothing is sent until the merchant approves and sends.
 */
export default async function PreviewPage(props: PageProps<"/deals/[dealId]/offer/preview">) {
  const { dealId } = await props.params;
  const { s, out, progress, activeCase, deal } = await loadDeal(dealId);
  const v = s.agreements.find((a) => a.version === s.selectedOption?.draftVersion && a.status === "draft");
  if (!v || progress.stage !== "offer") redirect(stageHref(dealId, progress.stage));
  const stale = progress.primaryAction?.id === "review_updated_proposal";
  const newEvidence = progress.primaryAction?.id === "review_new_evidence";
  const view = proposalView(v, deal.packages, deal.merchant.policy);
  const buyerMessage = proposalMessageText(v.terms, v.version, proposalLinkOf(v));
  const x = out.evaluation.result?.structures.find((e) => e.structure.id === v.structureId) ?? s.counterOffers.find((c) => c.evaluated.structure.id === v.structureId)?.evaluated ?? null;
  const lastBuyerMessage = [...s.conversation].reverse().find((i) => i.direction === "inbound" && (i.kind === "buyer_reply" || i.kind === "change_request"));
  const rows: [string, string][] = [
    ["Included", `${view.included.map((i) => i.name).join(", ")}`],
    ["Buyer pays", `${formatINR(view.totalPaise)} incl. GST · ${view.payments.length === 1 ? "one payment" : `${view.payments.length} × ${formatINR(view.payments[0]!.totalPaise)}`}`],
    ...(x ? [["You keep", `${approxINR(x.economics.netContributionPaise)} · ${Math.round(x.economics.netContributionBps / 100)}% of the price`] as [string, string]] : []),
    ...(x ? [["Approval", x.approval === "within_limit" ? "Buyer can approve" : "Needs their MD's approval"] as [string, string]] : []),
  ];
  return (
    <StageShell dealId={dealId} viewing="offer">
      <div className="mx-auto max-w-[600px] space-y-4">
        {stale ? <Notice tone="amber" title="The offer changed since you reviewed it.">Go back to the offer and review the updated proposal.</Notice> : null}
        {newEvidence ? <EvidenceReview s={s} /> : null}
        <dl className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface px-4 py-1 text-[14px]" data-testid="send-summary">
          {rows.map(([k, val]) => (
            <div key={k} className="flex justify-between gap-4 py-2">
              <dt className="text-ink-2">{k}</dt>
              <dd className="text-right text-ink" data-testid={`summary-${k.toLowerCase().replace(/ /g, "-")}`}>{val}</dd>
            </div>
          ))}
        </dl>
        <section className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface" aria-label="Message to the buyer">
          <div className="flex items-center gap-2 border-b border-line px-5 py-3 text-[15px] font-semibold text-ink">
            <MessageCircle aria-hidden className="h-4 w-4 text-green" /> {activeCase.buyer.name}
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[13px] font-normal text-ink-2">WhatsApp (simulated)</span>
          </div>
          {lastBuyerMessage ? (
            <div className="bg-[#efeae2] px-3 pt-3">
              <div className="max-w-[88%] rounded-lg rounded-tl-none bg-white px-3 py-2 text-[14px] leading-5 text-ink shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">{lastBuyerMessage.text}</div>
            </div>
          ) : null}
          <div className="flex items-end gap-3 bg-[#f0f2f5] p-3">
            <div className="min-w-0 flex-1 rounded-xl border-[1.5px] border-dashed border-[#8696a0] bg-[#d9fdd3] px-3 py-2" data-testid="buyer-message-preview">
              <div className="text-[12px] text-[#41525d]" data-testid="preview-frame">Not sent yet</div>
              <p className="mt-0.5 text-[14px] leading-5 text-ink [overflow-wrap:anywhere]">{buyerMessage}</p>
              <div className="mt-2 rounded-lg border-l-4 border-blue bg-white px-3 py-2 text-[13px]" data-testid="proposal-card">
                <div className="font-semibold text-ink">Proposal · version {v.version}</div>
                <div className="text-ink-2">{formatINR(view.totalPaise)} · {view.payments.length === 1 ? "1 payment" : `${view.payments.length} payments`}</div>
              </div>
            </div>
            {stale || newEvidence ? null : <PreviewActions dealId={dealId} version={v.version} termsHash={v.termsHash} />}
          </div>
        </section>
        <div className="flex flex-wrap items-center gap-4">
          <BuyerViewSheet buyerName={activeCase.buyer.name}>
            <ProposalContent view={view} merchantName={deal.merchant.name} nextHeading="After you accept" nextSteps={view.nextSteps} />
          </BuyerViewSheet>
          <Link href={`/deals/${dealId}/offer`} className="text-[14px] font-semibold text-blue hover:underline" data-testid="back-to-offer">
            Back to offer
          </Link>
        </div>
        <details className="rounded-xl border border-line bg-surface px-4 py-2" data-testid="preview-agreement-details">
          <summary className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink">
            <Lock aria-hidden className="h-3.5 w-3.5 text-muted" /> Agreement details
          </summary>
          <dl className="space-y-1 py-2 text-[12px]">
            <dt className="text-muted">Version</dt>
            <dd className="text-ink">{v.version} (draft)</dd>
            <dt className="text-muted">Terms hash (SHA-256)</dt>
            <dd>
              <code className="break-all font-mono text-[12px] text-ink" data-testid="preview-hash">
                {v.termsHash}
              </code>
            </dd>
          </dl>
        </details>
      </div>
    </StageShell>
  );
}
