import Link from "next/link";
import { formatDate, formatDateValue } from "@/domain/dates";
import { formatINR, sum } from "@/domain/money";
import type { AgreementVersion } from "@/domain/agreement";
import { AcceptForm, ActionButton } from "@/components/client";
import { fmtTime } from "@/components/evidence";
import { PaymentTable } from "@/components/structure-card";
import { Badge, Card, CardHeader, Empty, Label, Notice, Pill } from "@/components/ui";
import { heroPackages } from "@/data/synthetic/hero";
import { loadPage, structureFor } from "@/lib/page-data";

const pkgName = (id: string) => heroPackages.find((p) => p.id === id)?.name ?? id;

function HashLine({ label, hash, ok }: { label: string; hash: string | null; ok: boolean | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      <span className="w-40 shrink-0 font-semibold text-ink-2">{label}</span>
      {hash ? <code className="break-all font-mono text-[11px] text-ink">{hash}</code> : <span className="text-muted">Not yet</span>}
      {ok === true ? <Badge tone="green">Matches</Badge> : ok === false ? <Badge tone="red">Mismatch</Badge> : null}
    </div>
  );
}

function VersionCard({ v }: { v: AgreementVersion }) {
  const both = v.merchantApproval && v.buyerAcceptance;
  return (
    <Card as="article" data-testid={`version-${v.version}`}>
      <CardHeader
        title={`Version ${v.version}`}
        meta={
          <>
            <Badge tone={v.status === "active" ? "green" : v.status === "superseded" ? "neutral" : "blue"}>{v.status.replace(/_/g, " ")}</Badge>
            {v.supersedes ? <Pill>Revises version {v.supersedes}</Pill> : null}
            {both ? <Badge tone={v.merchantApproval!.termsHash === v.buyerAcceptance!.termsHash ? "green" : "red"} >{v.merchantApproval!.termsHash === v.buyerAcceptance!.termsHash ? "Approval and acceptance hashes match" : "Hashes differ"}</Badge> : null}
          </>
        }
      />
      <div className="space-y-2 p-5">
        <HashLine label="Terms hash (SHA-256)" hash={v.termsHash} ok={null} />
        <HashLine label="Merchant approval" hash={v.merchantApproval?.termsHash ?? null} ok={v.merchantApproval ? v.merchantApproval.termsHash === v.termsHash : null} />
        {v.merchantApproval ? <div className="pl-0 text-[12px] text-muted sm:pl-42">{v.merchantApproval.by} · {fmtTime(v.merchantApproval.at)}</div> : null}
        <HashLine label="Buyer acceptance" hash={v.buyerAcceptance?.termsHash ?? null} ok={v.buyerAcceptance ? v.buyerAcceptance.termsHash === v.termsHash : null} />
        {v.buyerAcceptance ? (
          <div className="text-[12px] text-muted sm:pl-42">
            {v.buyerAcceptance.by} · {fmtTime(v.buyerAcceptance.at)}
            {v.buyerAcceptance.authorityConfirmed ? " · authority for this scope confirmed" : ""}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export default async function AgreementPage(props: PageProps<"/agreement">) {
  const role = (await props.searchParams).role === "buyer" ? "buyer" : "merchant";
  const page = await loadPage();
  const { s } = page;
  const versions = [...s.agreements].sort((a, b) => b.version - a.version);
  if (!versions.length) {
    return (
      <Empty>
        No agreement yet. Approve an engine-feasible option on the <Link className="font-semibold text-blue" href="/decision">Decision</Link> view.
      </Empty>
    );
  }
  return role === "buyer" ? <BuyerView page={page} /> : <MerchantView page={page} versions={versions} />;
}

function MerchantView({ page, versions }: { page: Awaited<ReturnType<typeof loadPage>>; versions: AgreementVersion[] }) {
  const { s } = page;
  const link = s.paymentLinks.at(-1);
  const linkAttempt = s.attempts.find((a) => a.razorpayId === link?.id);
  const m = s.mandate;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="space-y-4">
        {versions.map((v) => (
          <VersionCard key={v.version} v={v} />
        ))}
        <Notice tone="blue" title="Activation rule">
          An agreement becomes active only when merchant approval and buyer acceptance carry the same SHA-256 terms hash. Payment APIs are unreachable before that, and the AI never calls them.
        </Notice>
      </div>
      <div className="space-y-4">
        <Card aria-labelledby="plink" data-testid="payment-link">
          <CardHeader id="plink" title="Upfront payment link" meta={link ? <Label kind={link.mode === "real_test" ? "test_mode" : "simulated"} /> : null} />
          <div className="space-y-2 p-5 text-[13px]">
            {link ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{formatINR(link.amountPaise)}</span>
                  <Badge tone={link.status === "paid" ? "green" : "blue"}>{link.status === "paid" ? "Paid" : link.status === "created" ? "Awaiting payment" : link.status}</Badge>
                </div>
                <div className="text-ink-2">
                  Link <code className="font-mono text-[12px]">{link.id}</code>
                </div>
                <div className="break-all text-muted">{link.mode === "simulated" ? `${link.shortUrl} (simulated; not a real link)` : link.shortUrl}</div>
                <div className="text-muted">Reference (idempotency key): {link.referenceId}</div>
                {linkAttempt?.status === "scheduled" ? (
                  link.mode === "simulated" ? (
                    <ActionButton body={{ action: "simulate", event: "payment_link_paid" }} variant="sim" testId="sim-link-paid">
                      Simulated event: buyer pays link
                    </ActionButton>
                  ) : (
                    <ActionButton body={{ action: "check_payment_link" }}>Check status (Razorpay test mode)</ActionButton>
                  )
                ) : null}
              </>
            ) : (
              <Empty>Created after the buyer accepts.</Empty>
            )}
          </div>
        </Card>
        <Card aria-labelledby="mandate" data-testid="mandate">
          <CardHeader id="mandate" title="Recurring mandate" meta={m ? <Label kind={m.mode === "real_test" ? "test_mode" : "simulated"} /> : null} />
          <div className="space-y-2 p-5 text-[13px]">
            {m ? (
              <>
                <dl className="tabular grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
                  <dt className="text-muted">Per-debit limit</dt>
                  <dd className="font-semibold text-ink">{formatINR(m.perDebitLimitPaise)}</dd>
                  <dt className="text-muted">End date</dt>
                  <dd className="font-semibold text-ink">{formatDate(m.endDate)}</dd>
                  <dt className="text-muted">Status</dt>
                  <dd>
                    <Badge tone={m.status === "confirmed" ? "green" : m.status === "pending" ? "amber" : "red"}>{m.status}</Badge>
                  </dd>
                  <dt className="text-muted">Method</dt>
                  <dd className="text-ink">e-mandate</dd>
                  <dt className="text-muted">Agreement version</dt>
                  <dd className="text-ink">v{m.agreementVersion}</dd>
                </dl>
                <p className="text-[12px] text-muted">{m.note}</p>
                <p className="text-[12px] text-muted">A mandate does not guarantee payment. Adaptive Deals tracks the agreement balance itself.</p>
                {m.status === "pending" ? (
                  <ActionButton body={{ action: "simulate", event: "mandate_confirmed" }} variant="sim" testId="sim-mandate">
                    Simulated event: mandate confirmed
                  </ActionButton>
                ) : null}
              </>
            ) : (
              <Empty>Registered after acceptance when the schedule has recurring debits.</Empty>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function BuyerView({ page }: { page: Awaited<ReturnType<typeof loadPage>> }) {
  const { s } = page;
  const pending = [...s.agreements].reverse().find((v) => v.status === "sent");
  const shown = pending ?? [...s.agreements].reverse().find((v) => v.status === "active") ?? s.agreements.at(-1)!;
  const x = structureFor(page, shown);
  const amendment = s.amendments.find((a) => a.toVersion === shown.version);
  const t = shown.terms;
  return (
    <div className="mx-auto max-w-3xl space-y-4" data-testid="buyer-view">
      <Notice tone="amber" title="Demo buyer view · no login">
        A demonstration of what the buyer is asked to accept. It is not a buyer portal and has no authentication. In practice the merchant shares the proposal with the buyer.
      </Notice>
      <Card>
        <div className="border-b border-line px-6 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <Label kind="demo_buyer" />
            <Label kind="synthetic" />
            <Pill>Version {shown.version}</Pill>
            <Badge tone={shown.status === "sent" ? "blue" : "green"}>{shown.status === "sent" ? "Awaiting your acceptance" : shown.status}</Badge>
          </div>
          <h2 className="mt-3 text-[20px] font-bold text-ink">{amendment ? "Revised payment date" : "Proposal from Pinecone Media Works"}</h2>
          <p className="mt-1 text-[13px] text-ink-2">For Kestrel Lane Clinics (fictional).</p>
          {amendment ? (
            <p className="mt-2 text-[14px] text-ink">
              Instalment {amendment.change.lineId.replace("pay-", "")} moves from <strong>{formatDate(amendment.change.fromDueDate)}</strong> to <strong>{formatDate(amendment.change.toDueDate)}</strong>. Amounts are unchanged.
            </p>
          ) : null}
        </div>
        <div className="space-y-5 px-6 py-5">
          <section>
            <h3 className="text-[13px] font-semibold text-ink">Scope</h3>
            <ul className="mt-1 list-disc pl-5 text-[13px] text-ink-2">
              {t.scope.map((i) => (
                <li key={i.packageId}>
                  {pkgName(i.packageId)}
                  {i.months > 1 ? ` · ${i.months} months` : ""}
                </li>
              ))}
            </ul>
            {t.excludedPackageIds.length ? <p className="mt-1 text-[12px] text-muted">Not included: {t.excludedPackageIds.map(pkgName).join(", ")}. Any later purchase follows your normal approval process.</p> : null}
          </section>
          <section>
            <h3 className="text-[13px] font-semibold text-ink">Payments (GST included)</h3>
            {x ? <PaymentTable x={x} /> : null}
            <p className="mt-2 text-[13px] font-semibold text-green" data-testid="no-financing">
              No additional financing charge added by the seller.
            </p>
          </section>
          <section>
            <h3 className="text-[13px] font-semibold text-ink">Delivery</h3>
            <p className="text-[13px] text-ink-2">
              {t.deliverySchedule.length} monthly delivery lines from {formatDate(`${t.deliverySchedule[0].month.value}-01`)} to the end of {formatDateValue(t.deliverySchedule.at(-1)!.month)}. Total {formatINR(t.pricing.prePaise)} excl. GST · {formatINR(t.pricing.totalPaise)} incl. GST.
            </p>
          </section>
          {t.mandate ? (
            <section>
              <h3 className="text-[13px] font-semibold text-ink">Recurring payments</h3>
              <p className="text-[13px] text-ink-2">
                Later instalments are collected by mandate: at most {formatINR(t.mandate.perDebitLimitPaise)} per debit, ending {formatDate(t.mandate.endDate.value)}. You get an advance notice before each debit. <Label kind="simulated" />
              </p>
            </section>
          ) : null}
          <section className="rounded-xl bg-surface-muted px-4 py-3">
            <div className="text-[12px] font-semibold text-ink-2">Terms hash (SHA-256)</div>
            <code className="break-all font-mono text-[12px] text-ink" data-testid="buyer-hash">
              {shown.termsHash}
            </code>
            <div className="mt-1 text-[12px] text-muted">The merchant approved this exact hash{shown.merchantApproval ? ` on ${fmtTime(shown.merchantApproval.at)}` : ""}.</div>
          </section>
          {shown.status === "sent" ? (
            <AcceptForm action={amendment ? "accept_amendment" : "accept_agreement"} version={shown.version} termsHash={shown.termsHash} needsAuthority={t.conditions.includes("buyer_confirms_authority_for_phase_scope")} />
          ) : (
            <Notice tone="green" title="Accepted">
              You accepted version {shown.version}
              {shown.buyerAcceptance ? ` on ${fmtTime(shown.buyerAcceptance.at)}` : ""}.{" "}
              {s.paymentLinks.at(-1) ? `Upfront payment link: ${s.paymentLinks.at(-1)!.id} (${s.paymentLinks.at(-1)!.mode === "simulated" ? "simulated" : "Razorpay test mode"}) · ${formatINR(sum([s.paymentLinks.at(-1)!.amountPaise]))}.` : ""}
            </Notice>
          )}
        </div>
      </Card>
    </div>
  );
}
