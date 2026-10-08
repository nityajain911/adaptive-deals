import type { ReactNode } from "react";
import { loadDeal } from "@/lib/deal-page";
import { AuditDrawer, OpenAudit } from "../audit/audit-drawer";
import { AuditSections } from "../audit/sections";
import type { StageId } from "@/lib/progress";
import { StageTracker } from "./stage-tracker";
import { StickyNext } from "./sticky-next";
import { StatusBanner } from "./status-banner";
import { reevaluationAvailable, previewReevaluation } from "@/lib/service";
import { ReevaluationBanner } from "./reevaluation-banner";
import { commercialMemoryForDeal } from "@/lib/commercial-memory-view";

/** Rendered by every stage page with its own literal `viewing` stage (pages cannot pass state up to a layout). */
export async function StageShell({ dealId, viewing, children }: { dealId: string; viewing: StageId; children: ReactNode }) {
  const { s, out, progress, activeCase, deal } = await loadDeal(dealId);
  const reevaluation = await reevaluationAvailable(s) ? await previewReevaluation() : null;
  const memory = commercialMemoryForDeal({ merchantId: deal.merchant.id, buyerId: activeCase.buyer.id, asOf: "2026-10-08", serviceIds: deal.packages.map((item) => item.id) });
  return (
    <div className="mx-auto w-full max-w-[1200px] px-3 py-4 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">Adaptive Deals · Deal</div>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink sm:text-[28px]">{activeCase.buyer.name}</h1>
          <p className="mt-0.5 text-[13px] text-muted">{activeCase.proposalSummary}</p>
        </div>
        <span className="mt-1 text-[13px]">
          <OpenAudit section="evidence" testId="audit-details">
            Audit details
          </OpenAudit>
        </span>
      </div>
      <StatusBanner progress={progress} viewing={viewing} dealId={dealId} />
      {reevaluation ? <ReevaluationBanner preview={reevaluation} serviceNames={deal.packages.map((p) => p.name)} /> : null}
      <StageTracker progress={progress} dealId={dealId} />
      <div className="mt-5">{children}</div>
      {progress.kind === "action_required" && progress.primaryAction && progress.stage === viewing ? <StickyNext label={progress.primaryAction.label} /> : null}
      <AuditDrawer>
        <AuditSections s={s} out={out} deal={deal} memory={memory} />
      </AuditDrawer>
    </div>
  );
}
