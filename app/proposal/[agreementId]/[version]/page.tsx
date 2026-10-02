import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { formatDate } from "@/domain/dates";
import { formatINR } from "@/domain/money";
import { AcceptForm, DeclineButton, RequestChangeForm } from "@/components/client";
import { ProposalContent } from "@/components/proposal-content";
import { fmtTime } from "@/components/evidence";
import { cx } from "@/components/ui";
import { heroBuyer, heroMerchant, heroPackages } from "@/data/synthetic/hero";
import { loadPage } from "@/lib/page-data";
import { AGREEMENT_ID, proposalLink } from "@/lib/service";
import { isDelivered } from "@/lib/deal-records";
import { parseVersionSegment, proposalView } from "@/lib/views";

export const metadata = { title: "Proposal · Pinecone Media Works" };

/**
 * Standalone, mobile-first buyer proposal. Every amount and date is read from the canonical
 * terms of this exact version; nothing here is copied from the merchant views.
 */
export default async function ProposalPage(props: PageProps<"/proposal/[agreementId]/[version]">) {
  const { agreementId, version: seg } = await props.params;
  const version = parseVersionSegment(seg);
  if (agreementId !== AGREEMENT_ID || version === null) notFound();
  const { s } = await loadPage();
  const v = s.agreements.find((x) => x.agreementId === agreementId && x.version === version);
  // A proposal link exists only once the merchant has approved and sent this exact version.
  // Buyer access opens only after a successful delivery of this exact version (spec §5.5).
  if (!v || !isDelivered(s.deliveries, v.version)) notFound();

  const view = proposalView(v, heroPackages, heroMerchant.policy);
  const amendment = s.amendments.find((a) => a.toVersion === v.version);
  const previous = v.supersedes ? s.agreements.find((x) => x.version === v.supersedes) : null;
  const changedLine = amendment ? v.terms.paymentSchedule.find((p) => p.id === amendment.change.lineId) : null;
  const previousLine = amendment && previous ? previous.terms.paymentSchedule.find((p) => p.id === amendment.change.lineId) : null;
  const replacement = v.status === "superseded" ? s.agreements.find((x) => x.supersedes === v.version && x.status !== "draft" && x.status !== "merchant_approved") : null;
  const myRequests = s.conversation.filter((i) => i.kind === "change_request" && i.refs.agreementVersion === v.version);
  // A revision changes one line; onboarding steps (link, mandate set-up) already happened.
  const nextSteps =
    amendment && changedLine && previousLine
      ? [
          amendment.mandateFit.fits
            ? `The ${formatINR(changedLine.totalPaise)} payment is debited on ${formatDate(changedLine.dueDate.value)} under your existing authorisation, instead of ${formatDate(previousLine.dueDate.value)}.`
            : `The ${formatINR(changedLine.totalPaise)} payment moves to ${formatDate(changedLine.dueDate.value)}; you will be asked for a fresh recurring authorisation.`,
          "Every other payment, the scope and the total stay exactly as before.",
          "Until you accept, your current agreement and its schedule stay in place.",
        ]
      : view.nextSteps;
  const link = v.status === "active" || v.status === "accepted" || v.status === "superseded" ? s.paymentLinks.at(-1) ?? null : null;

  return (
    <article className="mx-auto w-full max-w-[480px] overflow-hidden rounded-2xl bg-surface shadow-[0_1px_3px_rgba(16,24,40,0.08),0_0_0_1px_var(--border)]" data-testid="buyer-view" aria-labelledby="proposal-title">
      {/* 1. Merchant and buyer */}
      <header className="border-b border-line px-5 pb-4 pt-5">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-ink text-[13px] font-bold text-white" aria-hidden>
            PM
          </span>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-ink">{heroMerchant.name}</div>
            <div className="text-[12px] text-muted">for {heroBuyer.name}</div>
          </div>
        </div>
        <h1 id="proposal-title" className="mt-4 text-[22px] font-bold leading-7 tracking-tight text-ink">
          {amendment ? "Revised payment date" : "Your proposal"}
        </h1>
        {amendment && changedLine && previousLine ? (
          <p className="mt-1 text-[14px] leading-6 text-ink-2" data-testid="revision-summary">
            The {formatINR(changedLine.totalPaise)} payment moves from <strong>{formatDate(previousLine.dueDate.value)}</strong> to <strong>{formatDate(changedLine.dueDate.value)}</strong>. The amount and everything else are unchanged.
          </p>
        ) : null}
        <StatusBanner status={v.status} acceptedAt={v.buyerAcceptance?.at ?? null} declinedAt={v.buyerDecline?.at ?? null} replacement={replacement ? proposalLink(replacement) : null} replacementVersion={replacement?.version ?? null} />
      </header>

      <div className="space-y-5 px-5 py-5">
        {/* 2–7. Shared canonical content (same component as the merchant preview) */}
        <ProposalContent view={view} nextHeading={v.status === "sent" ? "After you accept" : "What happens next"} nextSteps={nextSteps} changedLineId={changedLine?.id ?? null} />
        {link ? (
          <p className="-mt-3 text-[12px] text-muted" data-testid="buyer-payment-link">
            Payment link {link.id} · {formatINR(link.amountPaise)} · {link.status === "paid" ? "paid" : "awaiting payment"} ({link.mode === "simulated" ? "simulated" : "Razorpay test mode"})
          </p>
        ) : null}

        {/* 8. Actions */}
        {v.status === "sent" ? (
          <section aria-label="Your response" className="space-y-2 border-t border-line pt-4" data-testid="buyer-actions">
            <AcceptForm action={amendment ? "accept_amendment" : "accept_agreement"} version={v.version} termsHash={v.termsHash} needsAuthority={view.authorityRequired} />
            <RequestChangeForm version={v.version} />
            {amendment ? <p className="text-center text-[12px] text-muted">To decline this revision, request a change. Your current agreement stays in place until you accept a revision.</p> : <DeclineButton version={v.version} />}
          </section>
        ) : null}
        {myRequests.length ? (
          <section aria-label="Your change requests" className="space-y-2" data-testid="buyer-change-requests">
            {myRequests.map((r) => (
              <div key={r.id} className="rounded-xl border border-[#ddd5ff] bg-violet-weak px-4 py-3 text-[13px]">
                <div className="font-semibold text-ink">Change requested · {fmtTime(r.createdAt)}</div>
                <p className="mt-0.5 text-ink-2">“{r.text}”</p>
                <p className="mt-1 text-[12px] text-muted">Sent to {heroMerchant.name} in your WhatsApp conversation (simulated), referring to version {v.version}. This proposal is unchanged until they send a new version.</p>
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
                <code className="break-all font-mono text-[11px] text-ink" data-testid="buyer-hash">
                  {v.termsHash}
                </code>
              </dd>
            </div>
            {v.merchantApproval ? (
              <div>
                <dt className="text-muted">Approved by {heroMerchant.name}</dt>
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
        <p className="text-center text-[11px] text-muted">Fictional merchant and buyer · synthetic figures · no real payment is taken</p>
      </div>
    </article>
  );
}

function StatusBanner({ status, acceptedAt, declinedAt, replacement, replacementVersion }: { status: string; acceptedAt: string | null; declinedAt: string | null; replacement: string | null; replacementVersion: number | null }) {
  if (status === "sent") return null;
  const box = "mt-3 rounded-xl px-3 py-2 text-[13px]";
  if (status === "accepted" || status === "active")
    return (
      <div className={cx(box, "bg-green-weak text-green")} role="status" data-testid="buyer-status">
        <strong>Accepted.</strong> You accepted this version{acceptedAt ? ` on ${fmtTime(acceptedAt)}` : ""}.
      </div>
    );
  if (status === "buyer_rejected")
    return (
      <div className={cx(box, "bg-red-weak text-red")} role="status" data-testid="buyer-status">
        <strong>Declined.</strong> You declined this proposal{declinedAt ? ` on ${fmtTime(declinedAt)}` : ""}. No payment has been set up.
      </div>
    );
  if (status === "superseded")
    return (
      <div className={cx(box, "bg-surface-muted text-ink-2")} role="status" data-testid="buyer-status">
        This version was replaced{replacementVersion ? ` by version ${replacementVersion}` : ""}.{" "}
        {replacement ? (
          <Link href={replacement} className="font-semibold text-blue underline">
            View the current version
          </Link>
        ) : null}
      </div>
    );
  return null;
}
