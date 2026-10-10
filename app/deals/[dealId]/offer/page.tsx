import Link from "next/link";
import { shortReason } from "@/domain/copy";
import { failedChecksBlockingEveryStructure, suggestedMerchantCloseReason } from "@/lib/reason-codes";
import { formatDate } from "@/domain/dates";
import { formatINR } from "@/domain/money";
import { ActionButton, PrimaryActionButton } from "@/components/client";
import { StageShell } from "@/components/deal/stage-shell";
import { fmtTime } from "@/components/evidence";
import { OpenAudit } from "@/components/audit/audit-drawer";
import { ClosedSummary } from "@/components/offer/closed-summary";
import { DontProceed } from "@/components/offer/dont-proceed";
import { EvidenceReview } from "@/components/offer/evidence-review";
import { buyerBudgetQuote } from "@/lib/chat-highlights";
import { eligibleStructures } from "@/lib/counter-eligibility";
import { Alternatives, contextLine, OtherOptions, Recommendation, Rejections } from "@/components/offer/recommendation";
import { DealOverrides, type OverrideAccount } from "@/components/offer/deal-overrides";
import { StrategyComparison } from "@/components/offer/strategy-comparison";
import { StrategyControl } from "@/components/offer/strategy-control";
import { Card, Notice } from "@/components/ui";
import { MERCHANT_CLOSE_REASONS, type MerchantCloseReason } from "@/lib/deal-records";
import { loadDeal, stageHref } from "@/lib/deal-page";
import { pinnedEconomicsOf } from "@/lib/deal-context";
import { headlineFor } from "@/lib/offer-copy";
import { offerNarrative } from "@/lib/offer-narrative";
import { strategyFeasibleOf } from "@/lib/service";
import { strategyView } from "@/domain/strategy";
import { loadKnowledgeSources } from "@/lib/knowledge";
import { RecommendationEvidence } from "@/components/commercial-memory/deal-evidence";
import { buildEconomicsEvidenceDraft } from "@/commercial-memory/economics-draft";
import { sourceTracesForDeal } from "@/lib/source-trace";

/** Stage 2 · Review the offer (spec §5). */
export default async function OfferPage(props: PageProps<"/deals/[dealId]/offer">) {
  const { dealId } = await props.params;
  const { s, out, progress, activeCase, deal, baseline } = await loadDeal(dealId);
  const st = progress.stages.offer;
  const r = out.evaluation.result;
  const policy = deal.merchant.policy;
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
    const codes = r ? failedChecksBlockingEveryStructure(r.structures) : [];
    return (
      <StageShell dealId={dealId} viewing="offer">
        <Card className="space-y-3 p-5" data-testid="offer-no-fit">
          <h2 className="text-[18px] font-semibold text-ink">{progress.headline}</h2>
          {primaryId === "close_in_adaptive_deals" && r ? (
            <div className="text-[13px] text-ink-2">
              All {r.structures.length} possible offers across {r.templatesEvaluated.length} approved offer types were evaluated. What blocks every one: {codes.map(shortReason).join("; ")}.
            </div>
          ) : (
            <p className="text-[13px] text-ink-2">The request can&apos;t be represented by your approved offer types. Adaptive Deals drafts no terms for it.</p>
          )}
          <DontProceed
            variant={primaryId === "close_in_adaptive_deals" ? "no_feasible" : "outside"}
            primary
            suggestedReason={primaryId === "close_in_adaptive_deals" ? suggestedMerchantCloseReason(codes) : "handled_elsewhere"}
          />
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

  // Recommendation (current): review or review-updated. Code ranks the feasible offers by the deal's strategy.
  const eligible = r ? eligibleStructures(s, r.structures) : [];
  const feasible = strategyFeasibleOf(s, out);
  const view = strategyView(feasible, s.economics.strategy, baseline);
  // The merchant's live counter-offer is theirs, shown first and never part of the ranked list.
  const liveCounter = s.counterOffers.at(-1) ?? null;
  // Only a total the merchant typed is "your counter-offer"; an offer the engine listed is shown as the merchant's selection.
  const activeCounter = liveCounter && liveCounter.source !== "listed_offer" && s.selectedOption?.structureId === liveCounter.evaluated.structure.id ? liveCounter : null;
  const selectedId = s.selectedOption && eligible.some((e) => e.structure.id === s.selectedOption!.structureId) ? s.selectedOption.structureId : view.leader?.structure.id;
  const x = eligible.find((e) => e.structure.id === selectedId);
  const control = <StrategyControl key={s.economics.strategy} current={s.economics.strategy} />;
  const pinned = await pinnedEconomicsOf(s);
  const account: OverrideAccount = {
    services: s.baseline.servicePrices.map((price) => ({ id: price.packageId, name: pinned.services.find((x) => x.id === price.packageId)?.name ?? price.packageId, costPaise: pinned.services.find((x) => x.id === price.packageId)?.directCostPaise ?? 0 })),
    floor: pinned.guardrails.contributionFloor,
    cashPaise: pinned.guardrails.cashAtRiskLimitPaise,
    discountBps: pinned.guardrails.discountLimitBps,
  };
  const overridesPanel = <DealOverrides account={account} overrides={s.economics.overrides} />;
  if (!x && view.mode === "discount_only" && r) {
    // Nothing fits at the quoted prices. A discount is permitted, never recommended, so none is called recommended.
    return (
      <StageShell dealId={dealId} viewing="offer">
        <div className="space-y-4">
          {control}
          <Card className="space-y-2 p-5" data-testid="no-standard-offer">
            <h2 className="text-[18px] font-semibold text-ink">No offer fits at your normal prices.</h2>
            <p className="text-[14px] text-ink-2">You allow discounts, so these offers would work, smallest discount first. Pick one yourself if you want to give a discount.</p>
          </Card>
          <Alternatives options={view.discounted} selectedId="" heading="Offers with a discount" testId="discount-only-offers" />
          {overridesPanel}
          <DontProceed />
        </div>
      </StageShell>
    );
  }
  if (!x || !r) return <StageShell dealId={dealId} viewing="offer">{null}</StageShell>;
  const narrative = offerNarrative({ s, out, x, view, eligible });
  const { isLeader, selectedByMerchant, wholeRupees } = narrative;
  const standard = view.mode === "standard";
  const options = standard ? view.ranked : view.discounted;
  const p = out.profile;
  const context = contextLine(
    baseline,
    p.budgetNow.value?.amountPaise ?? null,
    p.approvalLimit.value?.amountPaise ?? null,
    p.approvalScope.status === "stated" && p.approvalScope.value === "per_contract",
    p.amountsIncludeGst.value === "yes",
  );
  const label = progress.primaryAction?.label ?? "Review buyer proposal";
  const buyerSaid = buyerBudgetQuote(s.run.record.engine.profile, s.run.record.inputs.messages);
  const knowledgeSources = await loadKnowledgeSources();
  const sourceTraces = sourceTracesForDeal({
    profile: s.run.record.engine.profile,
    messages: s.run.record.inputs.messages,
    documentDraft: buildEconomicsEvidenceDraft(pinned, knowledgeSources, "2026-10-08"),
    documentSources: knowledgeSources,
  });
  const alt = isLeader ? view.withinApprovalAlternative : null;
  const leaderNote = isLeader && x.approval === "requires_approval" ? (
    alt ? (
      <div data-testid="within-approval-alternative" className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span><span className="font-semibold text-amber">Needs the buyer&apos;s MD approval.</span> The best offer the buyer can approve without it: <span className="font-semibold text-ink">{headlineFor(alt)}</span> · {formatINR(alt.structure.payments.reduce((n, p) => n + p.totalPaise, 0))} · you keep about {wholeRupees(alt.economics.netContributionPaise)}.</span>
        <ActionButton body={{ action: "select_option", structureId: alt.structure.id }} variant="ghost" testId="select-within-approval">Select this offer</ActionButton>
      </div>
    ) : (
      <span data-testid="no-within-approval"><span className="font-semibold text-amber">Needs the buyer&apos;s MD approval.</span> No offer fits within the buyer&apos;s approval limit.</span>
    )
  ) : null;
  return (
    <StageShell dealId={dealId} viewing="offer">
      <div className="space-y-4">
        {primaryId === "review_new_evidence" ? <EvidenceReview s={s} /> : null}
        {primaryId === "review_updated_proposal" ? <Notice tone="amber" title="The offer changed since you reviewed it.">Review the updated proposal before sending.</Notice> : null}
        {buyerSaid ? (
          <figure className="rounded-lg rounded-tl-none bg-[#efeae2] p-3" data-testid="buyer-said">
            <div className="max-w-[90%] rounded-lg rounded-tl-none bg-white px-3 py-2 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
              <figcaption className="text-[13px] font-semibold text-ink-2">{activeCase.buyer.name} said</figcaption>
              <blockquote className="mt-1 text-[15px] leading-6 text-ink">“{buyerSaid.quote}”</blockquote>
            </div>
          </figure>
        ) : null}
        {control}
        {!isLeader && !activeCounter && view.leader ? (
          <Notice tone="blue" title="You chose a different offer from the one we suggest.">
            <span data-testid="strategy-differs">We&apos;d suggest: {headlineFor(view.leader)}.</span>{" "}
            <ActionButton body={{ action: "select_option", structureId: view.leader.structure.id }} variant="ghost" testId="use-recommended">Use the suggested offer</ActionButton>
          </Notice>
        ) : null}
        <Recommendation
          x={x}
          policy={policy}
          baseline={baseline}
          packages={deal.packages}
          context={context}
          presentation={selectedByMerchant ? "merchant_selected" : "recommended"}
          reason={narrative.reason}
          attribution={narrative.attribution}
          evidence={narrative.evidence}
          economics={{ version: s.economics.pinned.version, overrides: s.economics.overrides.length }}
          counter={activeCounter}
          leaderNote={leaderNote}
          primary={
            <>
              {primaryId === "review_new_evidence" ? null : (
                <PrimaryActionButton body={{ action: "review_buyer_proposal" }} onDone={preview}>
                  {label}
                </PrimaryActionButton>
              )}
              <DontProceed />
            </>
          }
        />
        <RecommendationEvidence
          traces={sourceTraces}
          engineFacts={[
            `${x.sellerChecks.filter((check) => check.status === "pass").length} merchant checks passed`,
            `${x.buyerChecks.filter((check) => check.status === "pass").length} buyer checks passed`,
            x.approval === "within_limit" ? "Within the buyer's stated approval limit" : "Buyer approval is still required",
          ]}
        />
                <OtherOptions>
          {standard ? <StrategyComparison feasible={feasible} baseline={baseline} current={s.economics.strategy} /> : null}
          <Alternatives options={options} selectedId={x.structure.id} />
        </OtherOptions>
        {overridesPanel}
        <Rejections r={r} />
      </div>
    </StageShell>
  );
}
