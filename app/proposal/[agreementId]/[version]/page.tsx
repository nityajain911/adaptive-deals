import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { DEMO_ANCHOR, SimulatedClock } from "@/domain/clock";
import type { ChangeRequestContext } from "@/domain/change-request";
import { formatDate, localDateOf } from "@/domain/dates";
import { formatINR } from "@/domain/money";
import { AcceptForm, DeclineButton } from "@/components/client";
import { RequestChangeForm } from "@/components/buyer/request-change-form";
import { SetupDone, SetupPanel } from "@/components/buyer/setup-panel";
import { ProposalContent } from "@/components/proposal-content";
import { fmtTime } from "@/components/evidence";
import { cx } from "@/components/ui";
import { loadPage } from "@/lib/page-data";
import { activeCase, AGREEMENT_ID, proposalLink } from "@/lib/service";
import { isDelivered, isResolvingDisposition } from "@/lib/deal-records";
import { buyerProposalLifecycle, latestReplacementVersion, parseVersionSegment, proposalView, type BuyerProposalLifecycle } from "@/lib/views";
import { amendmentDiff } from "@/lib/amendment-diff";
import { checkRazorpayKey } from "@/integrations/razorpay/keys";

export const metadata = { title: "Proposal · Pinecone Media Works" };

/**
 * Standalone, mobile-first buyer proposal. Every amount and date is read from the canonical
 * terms of this exact version; nothing here is copied from the merchant views.
 */
export default async function ProposalPage(props: PageProps<"/proposal/[agreementId]/[version]">) {
  const { agreementId, version: seg } = await props.params;
  const version = parseVersionSegment(seg);
  if (agreementId !== AGREEMENT_ID || version === null) notFound();
  const { s, deal } = await loadPage();
  const buyer = activeCase(s).buyer;
  const v = s.agreements.find((x) => x.agreementId === agreementId && x.version === version);
  // A proposal link exists only once the merchant has approved and sent this exact version.
  // Buyer access opens only after a successful delivery of this exact version (spec §5.5).
  if (!v || !isDelivered(s.deliveries, v.version)) notFound();

  const view = proposalView(v, deal.packages, deal.merchant.policy);
  const amendment = s.amendments.find((a) => a.toVersion === v.version);
  const previous = v.supersedes ? s.agreements.find((x) => x.version === v.supersedes) : null;
  const changedLine = amendment ? v.terms.paymentSchedule.find((p) => p.id === amendment.change.lineId) : null;
  const previousLine = amendment && previous ? previous.terms.paymentSchedule.find((p) => p.id === amendment.change.lineId) : null;
  const differences = amendment && previous ? amendmentDiff(previous.terms, v.terms) : [];
  const replacement = v.status === "superseded" ? latestReplacementVersion(s.agreements, v.version) : null;
  const myRequests = s.conversation.filter((i) => i.kind === "change_request" && i.refs.agreementVersion === v.version);
  const currentLineIds = new Set(v.terms.paymentSchedule.map((line) => line.id));
  const versionAttempts = s.attempts.filter((attempt) => attempt.agreementId === v.agreementId && currentLineIds.has(attempt.scheduleLineId));
  const openBuyerRequest = myRequests.some((request) => !s.workDispositions.some((disposition) => disposition.sourceKind === "message" && disposition.sourceId === request.id && isResolvingDisposition(disposition.kind)));
  const paidLines = new Map(versionAttempts.filter((attempt) => attempt.status === "succeeded").map((attempt) => [attempt.scheduleLineId, attempt.amountPaise]));
  const lifecycle = buyerProposalLifecycle({
    agreement: v,
    hasBuyerRequest: openBuyerRequest && v.status === "sent",
    paymentLinkStatus: s.paymentLinks.at(-1)?.status ?? null,
    mandateStatus: s.mandate?.status ?? null,
    attempts: versionAttempts,
    fullyPaid: [...paidLines.values()].reduce((total, amount) => total + amount, 0) >= v.terms.pricing.totalPaise,
    replacementVersion: replacement?.version ?? null,
    isRevision: !!amendment,
  });
  // A revision changes one line; onboarding steps (link, mandate set-up) already happened.
  const proposedNextSteps = amendment && changedLine && previousLine
      ? [
          amendment.mandateFit.fits
            ? `The ${formatINR(changedLine.totalPaise)} payment is taken on ${formatDate(changedLine.dueDate.value)} instead of ${formatDate(previousLine.dueDate.value)}, using your existing automatic payment setup.`
            : `The ${formatINR(changedLine.totalPaise)} payment moves to ${formatDate(changedLine.dueDate.value)}; you will be asked to set up automatic payments again.`,
          "Until you accept, nothing changes.",
        ]
      : view.nextSteps;
  const nextSteps = lifecycle.setupBasis === "proposed"
    ? proposedNextSteps
    : lifecycle.state === "superseded"
      ? [replacement ? `Use version ${replacement.version} for the current terms and payment status.` : "This version is retained only as agreement history."]
      : lifecycle.state === "declined"
        ? ["No payment setup was created for this version."]
        : [lifecycle.detail];
  const link = v.status === "active" || v.status === "accepted" || v.status === "superseded" ? s.paymentLinks.at(-1) ?? null : null;

  // After acceptance the buyer pays and authorises automatic payment on this same page; nothing here is real money.
  const unpaidLink = !amendment && v.status === "active" ? versionAttempts.find((a) => a.method === "payment_link" && a.status === "scheduled") ?? null : null;
  const mandatePending = !amendment && v.status === "active" && s.mandate?.status === "pending";
  const nextRecurring = v.terms.paymentSchedule.find((line) => line.method === "recurring_debit") ?? null;
  const setupNeeded = !!unpaidLink || mandatePending;
  // With simulated payments the one tap that accepts also pays; a real Razorpay test link is opened separately.
  const upfrontLine = v.terms.paymentSchedule.find((line) => line.method === "payment_link") ?? null;
  const simulatedPayments = !(process.env.RAZORPAY_MODE === "test" && checkRazorpayKey(process.env.RAZORPAY_KEY_ID, process.env.RAZORPAY_KEY_SECRET).ok);
  const oneTap = !amendment && simulatedPayments && upfrontLine ? { payNowPaise: upfrontLine.totalPaise, autopay: view.recurring ? { perDebitLimitPaise: view.recurring.perDebitLimitPaise, endDate: view.recurring.endDate, noticeDays: view.recurring.noticeDays } : null } : null;
  const paidLinkAttempt = versionAttempts.find((a) => a.method === "payment_link" && a.status === "succeeded") ?? null;
  const nextScheduled = [...versionAttempts].filter((a) => a.status === "scheduled").sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null;
  const setupDone = !amendment && v.status === "active" && !setupNeeded && !!paidLinkAttempt;
  const requestContext: ChangeRequestContext = {
    currentTotalPaise: v.terms.paymentSchedule.reduce((total, line) => total + line.totalPaise, 0),
    services: deal.packages.map((p) => ({ id: p.id, name: p.name })),
    includedIds: v.terms.scope.map((x) => x.packageId),
    lines: v.terms.paymentSchedule.map((line) => ({ id: line.id, date: line.dueDate.value, totalPaise: line.totalPaise })),
    today: localDateOf(new SimulatedClock(DEMO_ANCHOR, s.clockAdvances).now(), deal.merchant.timeZone),
    gstRateBps: deal.merchant.policy.gstRateBps,
  };

  return (
    <article className="mx-auto w-full max-w-[480px] overflow-hidden rounded-2xl bg-surface shadow-[0_1px_3px_rgba(16,24,40,0.08),0_0_0_1px_var(--border)]" data-testid="buyer-view" aria-labelledby="proposal-title">
      {/* 1. Merchant and buyer */}
      <header className="border-b border-line px-5 pb-4 pt-5">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-ink text-[13px] font-bold text-white" aria-hidden>
            PM
          </span>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-ink">{deal.merchant.name}</div>
            <div className="text-[12px] text-muted">for {buyer.name}</div>
          </div>
        </div>
        <h1 id="proposal-title" className="mt-4 text-[22px] font-bold leading-7 tracking-tight text-ink">
          {amendment ? "Revised payment date" : v.continuesFrom ? "The rest of the year" : "Your proposal"}
        </h1>
        {amendment && changedLine && previousLine ? (
          <p className="mt-1 text-[14px] leading-6 text-ink-2" data-testid="revision-summary">
            Check what is changing below before you accept.
          </p>
        ) : null}
        <StatusBanner setupNeeded={setupNeeded} lifecycle={lifecycle} acceptedAt={v.buyerAcceptance?.at ?? null} declinedAt={v.buyerDecline?.at ?? null} replacement={replacement ? proposalLink(replacement) : null} />
      </header>

      <div className="space-y-5 px-5 py-5">
        {setupNeeded ? (
          <SetupPanel
            payNow={unpaidLink ? { amountPaise: unpaidLink.amountPaise } : null}
            autopay={mandatePending && nextRecurring ? { amountPaise: nextRecurring.totalPaise, dateLabel: formatDate(nextRecurring.dueDate.value), noticeDays: view.recurring?.noticeDays ?? 3 } : null}
            realLinkUrl={unpaidLink && link?.mode === "real_test" ? link.shortUrl : null}
          />
        ) : setupDone ? (
          <SetupDone paidPaise={paidLinkAttempt ? paidLinkAttempt.amountPaise : null} next={nextScheduled ? { amountPaise: nextScheduled.amountPaise, dateLabel: formatDate(nextScheduled.dueDate) } : null} />
        ) : null}

        {/* 2–7. Shared canonical content (same component as the merchant preview) */}
        <ProposalContent view={view} merchantName={deal.merchant.name} nextHeading={lifecycle.nextHeading} nextSteps={nextSteps} changedLineId={changedLine?.id ?? null} amendmentDifferences={differences} showNextSteps={!lifecycle.showResponseActions} showAuthorityRequirement={false} revisionMode={amendment && lifecycle.showResponseActions ? "summary" : "full"} />
        {/* 8. Actions */}
        {lifecycle.showResponseActions ? (
          <section aria-label="Your response" className="space-y-2 border-t border-line pt-4" data-testid="buyer-actions">
            <AcceptForm action={amendment ? "accept_amendment" : "accept_agreement"} submitLabel={amendment && differences.every((difference) => !difference.changed || difference.category === "payment_date" || difference.category === "planned_invoice_date") ? "Accept new date" : undefined} version={v.version} termsHash={v.termsHash} authorityReason={view.authorityReason} totalPaise={view.totalPaise} oneTap={oneTap} />
            {v.continuesFrom ? <DeclineButton version={v.version} stop /> : null}
            <RequestChangeForm version={v.version} merchantName={deal.merchant.name} context={requestContext} label={amendment ? "Request another change" : undefined} kinds={amendment ? ["date", "other"] : undefined} />
            {amendment ? <p className="text-center text-[13px] text-muted">To decline this revision, request a change. Your current agreement stays in place until you accept a revision.</p> : null}
          </section>
        ) : null}
        {amendment && lifecycle.showResponseActions ? (
          <details className="rounded-xl border border-line" data-testid="full-revised-proposal">
            <summary className="cursor-pointer px-4 py-3 text-[14px] font-semibold text-ink">View full revised proposal</summary>
            <div className="border-t border-line px-4 py-4">
              <ProposalContent view={view} merchantName={deal.merchant.name} nextHeading={lifecycle.nextHeading} nextSteps={nextSteps} changedLineId={changedLine?.id ?? null} showNextSteps showAuthorityRequirement={false} revisionMode="details" />
            </div>
          </details>
        ) : null}
        {lifecycle.showResponseActions ? (
          <section aria-labelledby="next" className="border-t border-line pt-4">
            <h2 id="next" className="text-[13px] font-semibold uppercase tracking-wide text-muted">{lifecycle.nextHeading}</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] leading-5 text-ink-2" data-testid="next-steps">
              {nextSteps.map((step, index) => <li key={index}>{step}</li>)}
            </ol>
          </section>
        ) : null}
        {myRequests.length ? (
          <section aria-label="Your change requests" className="space-y-2" data-testid="buyer-change-requests">
            {myRequests.map((r) => (
              <div key={r.id} className="rounded-xl border border-[#ddd5ff] bg-violet-weak px-4 py-3 text-[13px]">
                <div className="font-semibold text-ink">Change requested · {fmtTime(r.createdAt)}</div>
                <p className="mt-0.5 text-ink-2">“{r.text}”</p>
                <p className="mt-1 text-[12px] text-muted">Sent. {deal.merchant.name} will review your request. This current offer remains valid until a new one is agreed upon.</p>
              </div>
            ))}
          </section>
        ) : null}

        {/* 9. Agreement details */}
        <details className="rounded-xl border border-line" data-testid="agreement-details">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-[13px] font-semibold text-ink">
            <Lock aria-hidden className="h-3.5 w-3.5 text-muted" /> Agreement details
          </summary>
          <dl className="space-y-2 border-t border-line px-4 py-3 text-[12px]">
            <div>
              <dt className="text-muted">Version</dt>
              <dd className="text-ink">
                {v.version}
                {v.supersedes ? ` (revises version ${v.supersedes})` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Terms hash (SHA-256)</dt>
              <dd>
                <code className="break-all font-mono text-[12px] text-ink" data-testid="buyer-hash">
                  {v.termsHash}
                </code>
              </dd>
            </div>
            {v.merchantApproval ? (
              <div>
                <dt className="text-muted">Approved by {deal.merchant.name}</dt>
                <dd className="text-ink">{fmtTime(v.merchantApproval.at)} · same hash</dd>
              </div>
            ) : null}
            {v.buyerAcceptance ? (
              <div>
                <dt className="text-muted">Accepted by you</dt>
                <dd className="text-ink">
                  {fmtTime(v.buyerAcceptance.at)} · {v.buyerAcceptance.termsHash === v.termsHash ? "same hash" : "hash mismatch"}
                  {v.buyerAcceptance.authorityConfirmed ? " · authority for this scope confirmed" : ""}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-muted">Invoices</dt>
              <dd className="text-ink">{v.terms.invoiceSchedule.length} GST invoices, one per payment, GST calculated per line</dd>
            </div>
          </dl>
        </details>
        {lifecycle.showResponseActions && !amendment && !v.continuesFrom ? <div className="pt-2"><DeclineButton version={v.version} /></div> : null}
        <p className="text-center text-[12px] text-muted">Fictional merchant and buyer · synthetic figures · no real payment is taken</p>
      </div>
    </article>
  );
}

function StatusBanner({ lifecycle, acceptedAt, declinedAt, replacement, setupNeeded }: { lifecycle: BuyerProposalLifecycle; acceptedAt: string | null; declinedAt: string | null; replacement: string | null; setupNeeded: boolean }) {
  const box = "mt-3 rounded-xl px-3 py-2 text-[13px]";
  if (lifecycle.state === "awaiting_response")
    return <div className={cx(box, "bg-blue-weak text-blue-ink")} role="status" data-testid="buyer-status"><strong>{lifecycle.headline}.</strong> {lifecycle.detail}</div>;
  if (lifecycle.state === "waiting_on_merchant")
    return <div className={cx(box, "bg-violet-weak text-violet")} role="status" data-testid="buyer-status"><strong>{lifecycle.headline}.</strong> {lifecycle.detail}</div>;
  if (["setup_pending", "payment_scheduled", "payment_pending", "retry_scheduled", "paid"].includes(lifecycle.state))
    return (
      <div className={cx(box, "bg-green-weak text-green")} role="status" data-testid="buyer-status">
        {setupNeeded ? <strong>You accepted this version{acceptedAt ? ` on ${fmtTime(acceptedAt)}` : ""}.</strong> : <><strong>Accepted · {lifecycle.headline}.</strong> You accepted this version{acceptedAt ? ` on ${fmtTime(acceptedAt)}` : ""}.</>}
      </div>
    );
  if (lifecycle.state === "declined")
    return (
      <div className={cx(box, "bg-red-weak text-red")} role="status" data-testid="buyer-status">
        <strong>Declined.</strong> You declined this proposal{declinedAt ? ` on ${fmtTime(declinedAt)}` : ""}. No payment has been set up.
      </div>
    );
  if (lifecycle.state === "superseded")
    return (
      <div className={cx(box, "bg-surface-muted text-ink-2")} role="status" data-testid="buyer-status">
        This version was replaced{lifecycle.replacementVersion ? ` by version ${lifecycle.replacementVersion}` : ""}.{" "}
        {replacement ? (
          <Link href={replacement} className="font-semibold text-blue underline">
            View the current version
          </Link>
        ) : null}
      </div>
    );
  return null;
}
