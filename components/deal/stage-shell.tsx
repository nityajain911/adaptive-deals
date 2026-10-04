import type { ReactNode } from "react";
import { loadDeal } from "@/lib/deal-page";
import { AuditDrawer, OpenAudit } from "../audit/audit-drawer";
import { AuditSections } from "../audit/sections";
import type { StageId } from "@/lib/progress";
import { StageTracker } from "./stage-tracker";
import { StatusBanner } from "./status-banner";
import { heroBuyer } from "@/data/synthetic/hero";

/** Rendered by every stage page with its own literal `viewing` stage (pages cannot pass state up to a layout). */
export async function StageShell({ dealId, viewing, children }: { dealId: string; viewing: StageId; children: ReactNode }) {
  const { s, out, progress } = await loadDeal(dealId);
  return (
    <div className="mx-auto w-full max-w-[1200px] px-3 py-4 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Adaptive Deals · Deal</div>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink sm:text-[28px]">{heroBuyer.name}</h1>
          <p className="mt-0.5 text-[13px] text-muted">Annual digital marketing opportunity</p>
        </div>
        <span className="mt-1 text-[13px]">
          <OpenAudit section="evidence" testId="audit-details">
            Audit details
          </OpenAudit>
        </span>
      </div>
      <StatusBanner progress={progress} viewing={viewing} dealId={dealId} />
      <StageTracker progress={progress} dealId={dealId} />
      <div className="mt-5">{children}</div>
      <AuditDrawer>
        <AuditSections s={s} out={out} />
      </AuditDrawer>
    </div>
  );
}
