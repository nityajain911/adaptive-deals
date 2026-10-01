import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDate } from "@/domain/dates";
import { formatINR } from "@/domain/money";
import type { AgreementVersion } from "@/domain/agreement";
import { ActionButton } from "@/components/client";
import { fmtTime } from "@/components/evidence";
import { Badge, Card, CardHeader, Empty, Label, Notice, Pill } from "@/components/ui";
import { loadPage } from "@/lib/page-data";
import { proposalLink } from "@/lib/service";

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
        {v.status !== "draft" && v.status !== "merchant_approved" ? (
          <div className="text-[12px]">
            <span className="font-semibold text-ink-2">Buyer proposal link: </span>
            <Link href={proposalLink(v)} className="font-semibold text-blue hover:underline" data-testid={`proposal-link-${v.version}`}>
              {proposalLink(v)}
            </Link>
            <span className="text-muted"> · exists only after merchant approval of this exact version</span>
          </div>
        ) : null}
        {v.buyerDecline ? <Badge tone="red">Declined by the buyer · {fmtTime(v.buyerDecline.at)}</Badge> : null}
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
  const page = await loadPage();
  const { s } = page;
  const versions = [...s.agreements].sort((a, b) => b.version - a.version);
  // The buyer view now lives on its own route; keep old links working.
  if ((await props.searchParams).role === "buyer") {
    const shared = versions.find((v) => v.status !== "draft" && v.status !== "merchant_approved");
    if (shared) redirect(proposalLink(shared));
  }
  if (!versions.length) {
    return (
      <Empty>
        No agreement yet. Approve an engine-feasible option on the <Link className="font-semibold text-blue" href="/decision">Decision</Link> view.
      </Empty>
    );
  }
  return <MerchantView page={page} versions={versions} />;
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
