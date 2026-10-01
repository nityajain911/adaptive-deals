import Link from "next/link";
import { RETRY_REMOVED_COPY, type Amendment } from "@/domain/amendment";
import { shortReason } from "@/domain/copy";
import { formatDate } from "@/domain/dates";
import { computeLedger } from "@/domain/ledger";
import { formatINR } from "@/domain/money";
import type { ChangeRequest } from "@/domain/restructure";
import { ActionButton } from "@/components/client";
import { ChangeRequestBadge, ConversationPanel } from "@/components/conversation-panel";
import { fmtTime } from "@/components/evidence";
import { Checks } from "@/components/structure-card";
import { Badge, Card, CardHeader, Empty, Label, Notice, Pill, SectionTitle, Stat, Table, cx } from "@/components/ui";
import { heroMerchant } from "@/data/synthetic/hero";
import { loadPage, structureFor } from "@/lib/page-data";
import { proposalLink, type DemoState } from "@/lib/service";
import { activeVersionOf, changeRequestDisplay } from "@/lib/views";

const ATTEMPT_TONE = { scheduled: "blue", submitted: "amber", succeeded: "green", failed: "red", removed: "neutral" } as const;
const PROV: Record<string, ["neutral" | "blue" | "green" | "amber" | "violet", string]> = {
  engine: ["neutral", "Engine / code"],
  merchant: ["blue", "Merchant"],
  buyer_demo: ["amber", "Demo buyer view"],
  simulated: ["violet", "Simulated event"],
  real_test: ["amber", "Razorpay test mode"],
  synthetic_replay: ["violet", "Synthetic replay"],
  live_model: ["blue", "Live model"],
};

export default async function TimelinePage() {
  const page = await loadPage();
  const { s, today } = page;
  const active = activeVersionOf(s.agreements) ?? [...s.agreements].reverse().find((v) => v.status !== "draft");
  if (!active) return <Empty>The timeline starts once an agreement is approved and accepted.</Empty>;
  const x = structureFor(page, active);
  const ledger = x ? computeLedger({ structure: x.structure, attempts: s.attempts, asOf: today, timeZone: heroMerchant.timeZone }) : null;
  const retryRemoved = s.attempts.some((a) => a.status === "removed" && a.origin === "internal_retry");
  const pendingNotice = s.notices.find((n) => !n.sentAt && s.attempts.find((a) => a.id === n.attemptId)?.status === "scheduled");
  const failedReplied = s.extraMessages.some((m) => m.inReplyTo && m.timestamp === "2026-12-01T11:05:00+05:30");
  const scenario = s.scenario?.record.engine.initial.state === "no_feasible_deal" ? s.scenario.record.engine.initial : null;

  return (
    <div className="space-y-6">
      <Card aria-labelledby="sim">
        <CardHeader id="sim" title="Simulation controls" meta={<><Label kind="simulated" /><span>Each control advances the demo clock explicitly and drives the same domain transitions a real test event would</span></>} />
        <div className="space-y-3 p-5">
          <div className="flex flex-wrap gap-2">
            <ActionButton body={{ action: "simulate", event: "payment_link_paid" }} variant="sim" disabled={!s.attempts.some((a) => a.method === "payment_link" && a.status === "scheduled")}>
              Buyer pays link
            </ActionButton>
            <ActionButton body={{ action: "simulate", event: "mandate_confirmed" }} variant="sim" disabled={s.mandate?.status !== "pending"}>
              Confirm mandate
            </ActionButton>
            <ActionButton body={{ action: "simulate", event: "advance_notice" }} variant="sim" testId="sim-advance-notice" disabled={!pendingNotice}>
              Send advance notice
            </ActionButton>
          </div>
          <details className="rounded-xl border border-line" data-testid="secondary-path">
            <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-semibold text-ink">Secondary path: restructure after a failed debit</summary>
            <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
              <ActionButton body={{ action: "simulate", event: "debit_failed" }} variant="sim" testId="sim-failed-debit" disabled={s.mandate?.status !== "confirmed" || !s.attempts.some((a) => a.method === "recurring_debit" && a.status === "scheduled" && a.origin !== "internal_retry")}>
                Simulate failed debit
              </ActionButton>
              <ActionButton body={{ action: "simulate", event: "buyer_reply" }} variant="sim" disabled={!s.attempts.some((a) => a.status === "failed") || failedReplied}>
                Buyer replies after the failure
              </ActionButton>
              <p className="w-full text-[12px] text-muted">The preventive path above is the main story: the buyer replies to the advance notice before any debit is attempted.</p>
            </div>
          </details>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="xl:self-start">
          <ConversationPanel s={s} scope="after_agreement" titleId="conv-after" />
        </div>
        <Restructuring page={page} />
      </div>

      {retryRemoved ? (
        <Notice tone="green" title={RETRY_REMOVED_COPY}>
          The internal retry existed only in Adaptive Deals, so it was removed after the buyer accepted the revision. The failed debit stays in history.
        </Notice>
      ) : null}

      {ledger ? (
        <section aria-labelledby="ledger">
          <SectionTitle id="ledger" meta={<Pill>As of {formatDate(today)}</Pill>}>
            Ledger · version {active.version}
          </SectionTitle>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="ledger">
            <Stat label="Balance excl. GST" value={formatINR(ledger.balance.prePaise)} />
            <Stat label="GST component" value={formatINR(ledger.balance.gstPaise)} hint="still to collect" />
            <Stat label="Customer-facing balance" value={formatINR(ledger.balance.totalPaise)} hint={`of ${formatINR(ledger.contract.totalPaise)}`} />
            <Stat label="Collected" value={formatINR(ledger.collected.totalPaise)} hint={`${formatINR(ledger.collected.prePaise)} excl. GST`} tone="good" />
            <Stat label="Unpaid service value" value={formatINR(ledger.unpaidServiceValuePaise)} hint="Delivered, not yet paid" />
            <Stat label="Funding requirement" value={formatINR(ledger.fundingRequirementPaise)} hint="Costs not yet covered" />
          </div>
          <p className="mt-2 text-[12px] text-muted">Unpaid service value and funding requirement are different measures and are never added together.</p>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card aria-labelledby="delivery">
          <CardHeader id="delivery" title="Delivery schedule" meta={<Label kind="engine" />} />
          <div className="p-3">{x ? <Table caption="Delivery schedule" head={["Month", "Package", "Value"]} rows={x.structure.deliveries.map((d) => [d.month, d.packageName, formatINR(d.valuePaise)])} /> : null}</div>
        </Card>
        <Card aria-labelledby="invoices">
          <CardHeader id="invoices" title="Invoice schedule" meta={<span>GST per line, half-up</span>} />
          <div className="p-3">{x ? <Table caption="Invoice schedule" head={["Invoice", "Date", "Excl. GST", "GST", "Total"]} rows={x.structure.invoices.map((i) => [i.id, formatDate(i.invoiceDate), formatINR(i.prePaise), formatINR(i.gstPaise), formatINR(i.totalPaise)])} /> : null}</div>
        </Card>
        <Card aria-labelledby="collections" data-testid="collections">
          <CardHeader id="collections" title="Collection schedule" meta={<span>One idempotency key per attempt</span>} />
          <div className="p-3">
            <Table
              caption="Collection attempts"
              head={["Due", "Line", "Amount", "Status"]}
              rows={s.attempts.map((a) => [
                <span key="d" className="whitespace-nowrap">
                  {formatDate(a.dueDate)}
                  <span className="block text-[11px] text-muted">{a.origin === "internal_retry" ? "Adaptive Deals retry" : a.origin === "amendment" ? `Revised · v${a.agreementVersion}` : `v${a.agreementVersion}`}</span>
                </span>,
                a.scheduleLineId,
                formatINR(a.amountPaise),
                <Badge key="s" tone={ATTEMPT_TONE[a.status]}>
                  {a.status}
                </Badge>,
              ])}
            />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card aria-labelledby="versions" data-testid="version-history">
          <CardHeader id="versions" title="Version history" />
          <div className="p-3">
            <Table
              caption="Agreement versions"
              head={["Version", "Status", "Terms hash", "Merchant", "Buyer"]}
              rows={s.agreements.map((v) => [
                `v${v.version}`,
                v.status.replace(/_/g, " "),
                <code key="h" className="font-mono text-[11px]">
                  {v.termsHash.slice(0, 16)}…
                </code>,
                v.merchantApproval ? (v.merchantApproval.termsHash === v.termsHash ? "✓ same hash" : "✕") : "—",
                v.buyerAcceptance ? (v.buyerAcceptance.termsHash === v.termsHash ? "✓ same hash" : "✕") : "—",
              ])}
            />
          </div>
        </Card>
        <Card aria-labelledby="events" data-testid="events">
          <CardHeader id="events" title="Event log" meta={<span>Every simulated action is labelled</span>} />
          <ol className="max-h-[420px] divide-y divide-line overflow-y-auto" tabIndex={0} aria-label="Events, newest first">
            {[...s.events].reverse().map((e) => (
              <li key={e.id} className="px-5 py-2.5 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={PROV[e.provenance][0]}>{PROV[e.provenance][1]}</Badge>
                  <span className="font-medium text-ink">{e.title}</span>
                </div>
                <div className="mt-0.5 text-[12px] text-muted">
                  {fmtTime(e.at)}
                  {e.detail ? ` · ${e.detail}` : ""}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card aria-labelledby="close" data-testid="close">
        <CardHeader id="close" title="Close" meta={<span>What we would measure, and where the product stops</span>} />
        <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-3">
          <div className="text-[13px] text-ink-2">
            <div className="font-semibold text-ink">Primary metric: realised contribution (definition only, no results)</div>
            Realised contribution within 90 days per eligible stalled deal = (cash received within 90 days excl. GST − refunds − payment fees − direct delivery costs incurred or committed because of the deal) ÷ all eligible stalled deals, including those that never sign.
          </div>
          <div className="text-[13px] text-ink-2">
            <div className="font-semibold text-ink">Merchant approval boundary</div>
            The AI reads the opening messages, words questions and explains options. Code computes every figure, decides feasibility and reads payment-change replies. Nothing reaches the buyer without the merchant approving an exact terms hash, and no payment action is possible until the buyer accepts that same hash.
          </div>
          <div className="text-[13px] text-ink-2">
            <div className="font-semibold text-ink">No feasible deal</div>
            {scenario ? (
              <span data-testid="no-feasible-example">
                “{s.scenario!.record.inputs.messages[0].text}” All {scenario.structures.length} structures across {scenario.templatesEvaluated.length} templates evaluated; none passes ({[...new Set(scenario.structures.flatMap((x) => x.failingCodes))].map(shortReason).join("; ")}).
              </span>
            ) : (
              <ActionButton body={{ action: "run_scenario", scenarioId: "scenario-no-feasible" }} variant="secondary">
                Show the no-feasible-deal example
              </ActionButton>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Buyer-triggered restructuring ───────────────────────────────────────────

const STEPS = ["Change requested", "Draft amendment", "Merchant approved", "Buyer accepted", "Payment rescheduled"] as const;

function stepIndex(c: ChangeRequest, a: Amendment | undefined): number {
  if (c.state === "payment_rescheduled") return 4;
  if (c.state === "change_requested") return 0;
  if (!a) return 1;
  return a.state === "proposed" ? 1 : a.state === "merchant_approved" ? 2 : 3;
}

function Restructuring({ page }: { page: Awaited<ReturnType<typeof loadPage>> }) {
  const { s } = page;
  const active = activeVersionOf(s.agreements);
  const activeV = active?.version ?? null;
  // The request in focus: the latest one that is not stale. Stale requests appear only in history.
  const focus = [...s.changeRequests].reverse().find((c) => changeRequestDisplay(c, activeV).kind !== "stale") ?? null;
  return (
    <Card aria-labelledby="restructure" data-testid="restructuring">
      <CardHeader id="restructure" title="Buyer-triggered restructuring" meta={<span>Code reads the supported date phrase, then rechecks the whole agreement. AI is not used here.</span>} />
      <div className="space-y-5 p-5">
        {focus ? <FocusRequest c={focus} s={s} page={page} /> : <Empty>No change requested. When the buyer answers an advance notice with a supported date (for example “till the 20th”), it appears here.</Empty>}
        {s.changeRequests.length ? (
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted">Change request history</h3>
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line" data-testid="change-request-history">
              {s.changeRequests.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-[12px]">
                  <span className="font-mono text-ink-2">{c.id}</span>
                  <ChangeRequestBadge label={changeRequestDisplay(c, activeV).label} />
                  <span className="text-ink-2">
                    “{c.phrase}” · {c.scheduleLineId} · version {c.agreementVersion} · {fmtTime(c.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function FocusRequest({ c, s, page }: { c: ChangeRequest; s: DemoState; page: Awaited<ReturnType<typeof loadPage>> }) {
  const reply = s.conversation.find((i) => i.id === c.replyId);
  const notice = s.notices.find((n) => n.id === c.noticeId);
  const a = s.amendments.find((x) => x.id === c.amendmentId);
  const idx = stepIndex(c, a);
  const fromV = a ? s.agreements.find((v) => v.version === a.fromVersion) : null;
  const toV = a ? s.agreements.find((v) => v.version === a.toVersion) : null;
  const before = fromV ? structureFor(page, fromV) : null;
  const original = s.attempts.find((x) => x.id === c.attemptId);
  const replacement = a ? s.attempts.find((x) => x.origin === "amendment" && x.agreementVersion === a.toVersion && x.scheduleLineId === a.change.lineId) : null;
  const rejected = c.state === "not_restructured";
  return (
    <div className="space-y-4" data-testid="change-request" data-state={c.state}>
      <ol className="flex flex-wrap gap-1.5" aria-label="Restructuring progress">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === idx ? "step" : undefined} className={cx("rounded-full border px-2.5 py-1 text-[12px] font-semibold", rejected && i > 0 ? "border-line text-muted" : i < idx ? "border-[#c9eedd] bg-green-weak text-green" : i === idx ? (i === 4 ? "border-green bg-green text-white" : "border-blue bg-blue text-white") : "border-line text-muted")}>
            {i < idx || (i === 4 && idx === 4) ? "✓ " : ""}
            {label}
          </li>
        ))}
        {rejected ? (
          <li>
            <Badge tone="red">Not restructured</Badge>
          </li>
        ) : null}
      </ol>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-line p-4 text-[13px]">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Buyer message</div>
          <p className="mt-1 text-[15px] font-medium text-ink">“{reply?.text}”</p>
          <p className="mt-1 text-[12px] text-muted">
            {reply ? fmtTime(reply.createdAt) : ""} · reply to the advance notice for {notice ? `${formatINR(notice.amountPaise)} on ${formatDate(notice.dueDate)}` : c.scheduleLineId} · {c.timing === "preventive" ? "before any debit was attempted" : "after a failed debit"}
          </p>
        </div>
        <div className="rounded-xl border border-line p-4 text-[13px]" data-testid="code-reading">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Read by code · reply-rules.v1 · not AI</div>
          <p className="mt-1 text-ink">
            “{c.phrase}” → unavailable through <strong>{formatDate(c.unavailableUntil)}</strong> (inclusive) → earliest debit <strong>{formatDate(c.earliestDebit)}</strong>
          </p>
          <p className="mt-1 text-[12px] text-muted">{c.transformation}</p>
        </div>
      </div>

      {c.state === "change_requested" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#d6defe] bg-blue-weak px-4 py-3">
          <span className="text-[13px] text-ink-2">Nothing has changed yet. Drafting rechecks buyer constraints, projected contribution, funding requirement and mandate fit for {formatDate(c.earliestDebit)}.</span>
          <ActionButton body={{ action: "propose_amendment" }} variant="primary" testId="propose-amendment">
            Draft amendment and recheck
          </ActionButton>
        </div>
      ) : null}

      {a ? (
        <div className="space-y-4 rounded-xl border border-line p-4" data-testid="amendment">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-semibold text-ink">{a.state === "active" ? "Amendment" : "Draft amendment"}</h3>
            <Pill>
              v{a.fromVersion} → v{a.toVersion}
            </Pill>
            <Pill>Summary written by code from verified state</Pill>
            <Badge tone={a.state === "active" ? "green" : a.state === "rejected" ? "red" : "amber"}>{a.state.replace(/_/g, " ")}</Badge>
          </div>
          <p className="text-[14px] text-ink" data-testid="amendment-summary">
            Move the {formatINR(a.revised.structure.payments.find((p) => p.id === a.change.lineId)!.totalPaise)} payment ({a.change.lineId}) from {formatDate(a.change.fromDueDate)} to {formatDate(a.change.toDueDate)}. The amount and scope are unchanged.
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Checks title="Buyer checks (rechecked)" checks={a.revised.buyerChecks} />
            <Checks title="Seller checks (rechecked)" checks={a.revised.sellerChecks} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Projected contribution" value={formatINR(a.revised.economics.netContributionPaise)} hint={before ? (before.economics.netContributionPaise === a.revised.economics.netContributionPaise ? "Unchanged" : `was ${formatINR(before.economics.netContributionPaise)}`) : undefined} />
            <Stat label="Peak funding requirement" value={formatINR(a.revised.economics.peakFundingPaise)} hint={before ? `was ${formatINR(before.economics.peakFundingPaise)}` : undefined} />
            <div className="min-w-0 rounded-xl border border-line bg-surface px-4 py-3" data-testid="mandate-fit">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Mandate fit</div>
              <Badge tone={a.mandateFit.fits ? "green" : "red"} className="mt-1">
                {a.mandateFit.fits ? "Fits the existing mandate" : "Fresh authorisation required"}
              </Badge>
              <ul className="mt-1 space-y-0.5 text-[12px] text-ink-2">
                {a.mandateFit.reasons.map((r, i) => (
                  <li key={i}>{r.code === "WITHIN_PER_DEBIT_LIMIT" ? `✓ ${formatINR(r.amountPaise!)} within the per-debit limit` : r.code === "BEFORE_END_DATE" ? `✓ ${formatDate(r.dueDate!)} before the mandate end date` : r.code === "ABOVE_PER_DEBIT_LIMIT" ? `✕ ${formatINR(r.amountPaise!)} above the per-debit limit` : r.code === "AFTER_END_DATE" ? `✕ ${formatDate(r.dueDate!)} after the mandate end date` : "✕ Mandate is not confirmed"}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="rounded-xl bg-surface-muted px-4 py-3 text-[13px]" data-testid="collection-status">
            <div className="font-semibold text-ink">Collection</div>
            {original ? (
              <div className="mt-1 text-ink-2">
                Original attempt: {formatINR(original.amountPaise)} on {formatDate(original.dueDate)} · <Badge tone={ATTEMPT_TONE[original.status]}>{original.status}</Badge>
                {original.status === "scheduled" ? <span className="text-muted"> · kept until the merchant and the buyer approve the same new terms hash</span> : null}
              </div>
            ) : null}
            {replacement ? (
              <div className="mt-1 text-ink-2">
                New attempt: {formatINR(replacement.amountPaise)} on {formatDate(replacement.dueDate)} · version {replacement.agreementVersion} · <Badge tone={ATTEMPT_TONE[replacement.status]}>{replacement.status}</Badge>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {a.state === "proposed" && toV ? (
              <ActionButton body={{ action: "approve_amendment", termsHash: toV.termsHash }} variant="primary" testId="approve-amendment">
                Merchant: approve version {toV.version} and send
              </ActionButton>
            ) : null}
            {a.state === "merchant_approved" && toV ? (
              <Link href={proposalLink(toV)} className="text-[13px] font-semibold text-blue hover:underline" data-testid="awaiting-buyer">
                Awaiting buyer acceptance of version {toV.version} → open buyer proposal (demo)
              </Link>
            ) : null}
            <span className="text-[12px] text-muted">
              {a.history.map((h) => `${h.state.replace(/_/g, " ")} ${fmtTime(h.at)}`).join(" · ")}
            </span>
          </div>
        </div>
      ) : null}

      {c.state === "payment_rescheduled" && replacement ? (
        <Notice tone="green" title="Payment rescheduled">
          <span data-testid="payment-rescheduled">
            {formatINR(replacement.amountPaise)} will now be debited on {formatDate(replacement.dueDate)} under version {replacement.agreementVersion}. The {original ? formatDate(original.dueDate) : "original"} attempt was removed only after both approvals; its history is kept.
          </span>
        </Notice>
      ) : null}
      {rejected ? (
        <Notice tone="red" title="Not restructured">
          The revision to {formatDate(c.earliestDebit)} failed a recheck, so nothing changed: {c.history.at(-1)?.note}. Reply to the buyer personally.
        </Notice>
      ) : null}
    </div>
  );
}
