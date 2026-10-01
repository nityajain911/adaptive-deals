import Link from "next/link";
import { RETRY_REMOVED_COPY } from "@/domain/amendment";
import { shortReason } from "@/domain/copy";
import { addDays, formatDate } from "@/domain/dates";
import { unavailableUntilPhrase } from "@/lib/service";
import { computeLedger } from "@/domain/ledger";
import { formatINR } from "@/domain/money";
import { ActionButton } from "@/components/client";
import { fmtTime } from "@/components/evidence";
import { Badge, Card, CardHeader, Empty, Label, Notice, Pill, SectionTitle, Stat, Table } from "@/components/ui";
import { heroMerchant } from "@/data/synthetic/hero";
import { loadPage, structureFor } from "@/lib/page-data";

const ATTEMPT_TONE = { scheduled: "blue", submitted: "amber", succeeded: "green", failed: "red", removed: "neutral" } as const;
const PROV: Record<string, ["neutral" | "blue" | "green" | "amber" | "violet", string]> = {
  engine: ["neutral", "Engine"],
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
  const active = [...s.agreements].reverse().find((v) => v.status === "active") ?? [...s.agreements].reverse().find((v) => v.status !== "draft");
  if (!active) return <Empty>The timeline starts once an agreement is approved and accepted.</Empty>;
  const x = structureFor(page, active);
  const ledger = x ? computeLedger({ structure: x.structure, attempts: s.attempts, asOf: today, timeZone: heroMerchant.timeZone }) : null;
  const amendment = s.amendments.at(-1);
  const retryRemoved = s.attempts.some((a) => a.status === "removed" && a.origin === "internal_retry");
  const pendingNotice = s.notices.find((n) => !n.sentAt && s.attempts.find((a) => a.id === n.attemptId)?.status === "scheduled");
  const failed = s.attempts.some((a) => a.status === "failed");
  const replied = s.extraMessages.some((m) => m.inReplyTo);
  const draft = s.agreements.find((v) => v.status === "draft" && v.version > 1);
  const reply = s.extraMessages.find((m) => amendment?.triggerRefs.includes(m.id)) ?? null;
  const scenario = s.scenario?.record.engine.initial.state === "no_feasible_deal" ? s.scenario.record.engine.initial : null;

  return (
    <div className="space-y-6">
      <Card aria-labelledby="sim">
        <CardHeader id="sim" title="Simulation controls" meta={<><Label kind="simulated" /><span>Each control advances the demo clock explicitly and drives the same domain transitions a real test event would</span></>} />
        <div className="flex flex-wrap gap-2 p-5">
          <ActionButton body={{ action: "simulate", event: "payment_link_paid" }} variant="sim" disabled={!s.attempts.some((a) => a.method === "payment_link" && a.status === "scheduled")}>
            Buyer pays link
          </ActionButton>
          <ActionButton body={{ action: "simulate", event: "mandate_confirmed" }} variant="sim" disabled={s.mandate?.status !== "pending"}>
            Confirm mandate
          </ActionButton>
          <ActionButton body={{ action: "simulate", event: "advance_notice" }} variant="sim" disabled={!pendingNotice}>
            Send advance notice
          </ActionButton>
          <ActionButton body={{ action: "simulate", event: "debit_failed" }} variant="sim" testId="sim-failed-debit" disabled={s.mandate?.status !== "confirmed" || !s.attempts.some((a) => a.method === "recurring_debit" && a.status === "scheduled" && a.origin !== "internal_retry")}>
            Simulate failed debit
          </ActionButton>
          <ActionButton body={{ action: "simulate", event: "buyer_reply" }} variant="sim" disabled={!s.notices.some((n) => n.sentAt) || replied}>
            Buyer replies
          </ActionButton>
          <ActionButton body={{ action: "propose_amendment" }} variant="primary" disabled={!failed || !replied || s.status !== "active" || !!amendment}>
            Propose revision
          </ActionButton>
        </div>
      </Card>

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
          <div className="p-3">
            {x ? (
              <Table caption="Delivery schedule" head={["Month", "Package", "Value"]} rows={x.structure.deliveries.map((d) => [d.month, d.packageName, formatINR(d.valuePaise)])} />
            ) : null}
          </div>
        </Card>
        <Card aria-labelledby="invoices">
          <CardHeader id="invoices" title="Invoice schedule" meta={<span>GST per line, half-up</span>} />
          <div className="p-3">
            {x ? <Table caption="Invoice schedule" head={["Invoice", "Date", "Excl. GST", "GST", "Total"]} rows={x.structure.invoices.map((i) => [i.id, formatDate(i.invoiceDate), formatINR(i.prePaise), formatINR(i.gstPaise), formatINR(i.totalPaise)])} /> : null}
          </div>
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
                <Badge key="s" tone={ATTEMPT_TONE[a.status]}>{a.status}</Badge>,
              ])}
            />
          </div>
        </Card>
      </div>

      {retryRemoved ? (
        <Notice tone="green" title={RETRY_REMOVED_COPY}>
          The internal retry existed only in Adaptive Deals, so it was removed after the buyer accepted the revision. The failed debit stays in history.
        </Notice>
      ) : null}

      {amendment ? (
        <Card aria-labelledby="amend" data-testid="amendment">
          <CardHeader
            id="amend"
            title={`Revision: instalment ${amendment.change.lineId.replace("pay-", "")} from ${formatDate(amendment.change.fromDueDate)} to ${formatDate(amendment.change.toDueDate)}`}
            meta={<><Badge tone={amendment.state === "active" ? "green" : amendment.state === "rejected" ? "red" : "amber"}>{amendment.state.replace(/_/g, " ")}</Badge><Pill>v{amendment.fromVersion} → v{amendment.toVersion}</Pill></>}
          />
          <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-3">
            <div className="text-[13px] text-ink-2">
              <div className="font-semibold text-ink">Why this date</div>
              {reply ? (
                <>
                  The buyer replied “{reply.text}” to the advance notice. Code located “{unavailableUntilPhrase(reply.text)}” and read it from the reply&apos;s own timestamp ({fmtTime(reply.timestamp)}) as {formatDate(addDays(amendment.change.toDueDate, -1))}. “Till” includes that day, so the earliest debit is the next day.{" "}
                </>
              ) : null}
              The revision is re-checked against every buyer and seller check: {amendment.revised.verdict}.
            </div>
            <div className="text-[13px]" data-testid="mandate-fit">
              <div className="flex items-center gap-2 font-semibold text-ink">
                Mandate fit <Badge tone={amendment.mandateFit.fits ? "green" : "red"}>{amendment.mandateFit.fits ? "Fits the existing mandate" : "Fresh authorisation required"}</Badge>
              </div>
              <ul className="mt-1 space-y-0.5 text-ink-2">
                {amendment.mandateFit.reasons.map((r, i) => (
                  <li key={i}>
                    {r.code === "WITHIN_PER_DEBIT_LIMIT" ? `✓ ${formatINR(r.amountPaise!)} is within the per-debit limit` : r.code === "BEFORE_END_DATE" ? `✓ ${formatDate(r.dueDate!)} is before the mandate end date` : r.code === "ABOVE_PER_DEBIT_LIMIT" ? `✕ ${formatINR(r.amountPaise!)} is above the per-debit limit` : r.code === "AFTER_END_DATE" ? `✕ ${formatDate(r.dueDate!)} is after the mandate end date` : "✕ Mandate is not confirmed"}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2 text-[13px]">
              <div className="font-semibold text-ink">Approvals</div>
              {amendment.history.map((h, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-ink-2">
                  <Badge tone="neutral">{h.state.replace(/_/g, " ")}</Badge>
                  <span>{fmtTime(h.at)}</span>
                </div>
              ))}
              {amendment.state === "proposed" && draft ? (
                <ActionButton body={{ action: "approve_amendment", termsHash: draft.termsHash }} variant="primary" testId="approve-amendment">
                  Merchant: approve version {draft.version}
                </ActionButton>
              ) : null}
              {amendment.state === "merchant_approved" ? (
                <Link href="/agreement?role=buyer" className="inline-block font-semibold text-blue hover:underline">
                  Awaiting buyer acceptance → open Demo buyer view
                </Link>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card aria-labelledby="versions" data-testid="version-history">
          <CardHeader id="versions" title="Version history" />
          <div className="p-3">
            <Table
              caption="Agreement versions"
              head={["Version", "Status", "Terms hash", "Merchant", "Buyer"]}
              rows={s.agreements.map((v) => [
                `v${v.version}`,
                v.status,
                <code key="h" className="font-mono text-[11px]">{v.termsHash.slice(0, 16)}…</code>,
                v.merchantApproval ? (v.merchantApproval.termsHash === v.termsHash ? "✓ same hash" : "✕") : "—",
                v.buyerAcceptance ? (v.buyerAcceptance.termsHash === v.termsHash ? "✓ same hash" : "✕") : "—",
              ])}
            />
          </div>
        </Card>
        <Card aria-labelledby="events" data-testid="events">
          <CardHeader id="events" title="Event log" />
          <ol className="max-h-[420px] divide-y divide-line overflow-y-auto">
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
            <div className="font-semibold text-ink">Primary metric (definition only, no results)</div>
            Realised contribution within 90 days per eligible stalled deal = (cash received within 90 days excl. GST − refunds − payment fees − direct delivery costs incurred or committed because of the deal) ÷ all eligible stalled deals, including those that never sign.
          </div>
          <div className="text-[13px] text-ink-2">
            <div className="font-semibold text-ink">Merchant approval boundary</div>
            The AI reads, flags, words and ranks. Code computes every figure and decides feasibility. Nothing reaches the buyer without the merchant approving an exact terms hash, and no payment action is possible until the buyer accepts that same hash.
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
