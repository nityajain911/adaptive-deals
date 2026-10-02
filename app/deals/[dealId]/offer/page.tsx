import Link from "next/link";
import { shortReason } from "@/domain/copy";
import { failingChecks } from "@/domain/engine";
import { formatDate } from "@/domain/dates";
import { formatINR, sum } from "@/domain/money";
import { PrimaryActionButton } from "@/components/client";
import { StageShell } from "@/components/deal/stage-shell";
import { fmtTime } from "@/components/evidence";
import { OpenAudit } from "@/components/audit/audit-drawer";
import { ClosedSummary } from "@/components/offer/closed-summary";
import { DontProceed } from "@/components/offer/dont-proceed";
import { Alternatives, contextLine, Recommendation, Rejections, SuccessMeasure } from "@/components/offer/recommendation";
import { Card, Notice } from "@/components/ui";
import { MERCHANT_CLOSE_REASONS, type MerchantCloseReason } from "@/lib/deal-records";
import { loadDeal, stageHref } from "@/lib/deal-page";
import { headlineFor } from "@/lib/offer-copy";

/** Stage 2 · Review the offer (spec §5). */
export default async function OfferPage(props: PageProps<"/deals/[dealId]/offer">) {
  const { dealId } = await props.params;
  const { s, out, progress } = await loadDeal(dealId);
  const st = progress.stages.offer;
  const r = out.evaluation.result;
  const policy = s.run.record.inputs.policy;
  const preview = `/deals/${dealId}/offer/preview`;

  if (st === "upcoming") {
    return (
      <StageShell dealId={dealId} viewing="offer">
        <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-[14px] text-muted" data-testid="stage-upcoming">
          Available after the buyer constraints are confirmed.
        </p>
      </StageShell>
    );
  }

  // Settled: an offer was delivered (Track is current or later).
  if (st === "done") {
    const delivered = s.deliveries.filter((d) => d.deliveredAt && d.kind === "proposal").at(0);
    const v1 = s.agreements.find((v) => v.version === delivered?.version);
    const amended = s.agreements.find((v) => v.supersedes === v1?.version && (v.status === "active" || v.status === "accepted"));
    const x = r?.structures.find((e) => e.structure.id === v1?.structureId);
    return (
      <StageShell dealId={dealId} viewing="offer">
        <Card className="p-5" data-testid="offer-settled">
          <div className="text-[15px] font-semibold text-ink">
            Offer version {delivered?.version} sent · {delivered?.deliveredAt ? fmtTime(delivered.deliveredAt) : ""}
          </div>
          {amended ? <p className="mt-1 text-[13px] text-ink-2">Terms accepted from offer version {v1?.version} were amended by agreement version {amended.version} · payment date changed.</p> : null}
          {x && v1 ? (
            <p className="mt-2 text-[13px] text-ink-2">
              {headlineFor(x)} · {formatINR(v1.terms.pricing.totalPaise)} including GST · {v1.terms.paymentSchedule.map((p) => formatDate(p.dueDate.value)).join(", ")}
            </p>
          ) : null}
          <Link href={stageHref(dealId, progress.stage)} className="mt-2 inline-block text-[13px] font-semibold text-blue hover:underline">
            Go to the current stage →
          </Link>
        </Card>
      </StageShell>
    );
  }

  // Closed in Offer before any successful send (outcome summary arrives in plan Task 17).
  if (st === "closed") {
    const rec = [...s.outcomes].reverse().find((o) => o.type === "merchant_closed");
    const draftVersion = s.selectedOption?.draftVersion;
    const draft = (draftVersion ? s.agreements.find((v) => v.version === draftVersion) : null) ?? s.agreements.at(-1) ?? null;
    return (
      <StageShell dealId={dealId} viewing="offer">
        <ClosedSummary
          proposedTotalPaise={draft?.terms.pricing.totalPaise ?? null}
          reason={rec?.reasonCode ? MERCHANT_CLOSE_REASONS[rec.reasonCode as MerchantCloseReason] : null}
          note={rec?.note ?? null}
          closedAt={rec?.at ?? null}
        />
      </StageShell>
    );
  }

  const primaryId = progress.primaryAction?.id;

  if (primaryId === "inspect_records") {
    return (
      <StageShell dealId={dealId} viewing="offer">
        <Card className="space-y-3 p-5" data-testid="review-required">
          <h2 className="text-[18px] font-semibold text-ink">Saved deal records need review</h2>
          <p className="text-[13px] text-ink-2">{s.reviewRequired} Approval, sending and buyer acceptance are blocked: Adaptive Deals does not guess that a proposal was delivered.</p>
          <OpenAudit section="history" primary>
            Inspect records
          </OpenAudit>
        </Card>
      </StageShell>
    );
  }

  if (primaryId === "close_in_adaptive_deals" || primaryId === "mark_handled_outside") {
    const codes = r ? [...new Set(r.structures.flatMap((x) => failingChecks(x).map((c) => c.code)))] : [];
    return (
      <StageShell dealId={dealId} viewing="offer">
        <Card className="space-y-3 p-5" data-testid="offer-no-fit">
          <h2 className="text-[18px] font-semibold text-ink">{progress.headline}</h2>
          {primaryId === "close_in_adaptive_deals" && r ? (
            <div className="text-[13px] text-ink-2">
              All {r.structures.length} structures across {r.templatesEvaluated.length} templates were evaluated. What blocks every one: {codes.map(shortReason).join("; ")}.
            </div>
          ) : (
            <p className="text-[13px] text-ink-2">The request can&apos;t be represented by the merchant&apos;s permitted structures. Adaptive Deals drafts no terms for it.</p>
          )}
          <DontProceed variant={primaryId === "close_in_adaptive_deals" ? "no_feasible" : "outside"} primary />
        </Card>
      </StageShell>
    );
  }

  if (primaryId === "retry_sending") {
    const v = s.agreements.find((a) => a.version === progress.version);
    return (
      <StageShell dealId={dealId} viewing="offer">
        <Card className="space-y-3 p-5" data-testid="offer-approved-unsent">
          <h2 className="text-[18px] font-semibold text-ink">Approved · not yet sent to the buyer</h2>
          {progress.blockingReason ? <p className="text-[13px] text-red">Last attempt: {progress.blockingReason}</p> : null}
          {v ? <p className="text-[13px] text-ink-2">Version {v.version} · {formatINR(v.terms.pricing.totalPaise)} including GST. The buyer has no access until it is delivered.</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <PrimaryActionButton body={{ action: "retry_send", version: progress.version }} onDone={stageHref(dealId, "track")}>
              Retry sending
            </PrimaryActionButton>
            <DontProceed />
          </div>
        </Card>
      </StageShell>
    );
  }

  // Recommendation (current): review or review-updated.
  const eligible = r ? r.structures.filter((x) => x.approvable) : [];
  const ranked = (out.explanation?.order ?? []).map((id) => eligible.find((x) => x.structure.id === id)!).filter(Boolean);
  const options = ranked.length ? ranked : eligible;
  const selectedId = s.selectedOption && eligible.some((x) => x.structure.id === s.selectedOption!.structureId) ? s.selectedOption.structureId : options[0]?.structure.id;
  const x = options.find((o) => o.structure.id === selectedId);
  if (!x || !r) return <StageShell dealId={dealId} viewing="offer">{null}</StageShell>;
  const p = out.profile;
  const context = contextLine(p.budgetNow.value?.amountPaise ?? null, p.approvalLimit.value?.amountPaise ?? null, p.approvalScope.status === "stated" && p.approvalScope.value === "per_contract");
  const label = progress.primaryAction?.label ?? "Review buyer proposal";
  return (
    <StageShell dealId={dealId} viewing="offer">
      <div className="space-y-4">
        {primaryId === "review_updated_proposal" ? <Notice tone="amber" title="The offer changed since you reviewed it.">Review the updated proposal before sending.</Notice> : null}
        <Recommendation
          x={x}
          exp={out.explanation}
          policy={policy}
          context={context}
          primary={
            <>
              <PrimaryActionButton body={{ action: "review_buyer_proposal" }} onDone={preview}>
                {label}
              </PrimaryActionButton>
              <DontProceed />
            </>
          }
        />
        <SuccessMeasure />
        <Alternatives options={options} selectedId={x.structure.id} />
        <Rejections r={r} />
        <p className="text-[12px] text-muted">
          {r.structures.length} structures across {r.templatesEvaluated.length} templates evaluated · total including GST {formatINR(sum(x.structure.payments.map((q) => q.totalPaise)))}
        </p>
      </div>
    </StageShell>
  );
}
