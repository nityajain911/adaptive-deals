import type { RunOutcome } from "@/ai/orchestrator";
import { formatDate } from "@/domain/dates";
import type { EvaluatedStructure } from "@/domain/engine";
import { formatINR, sum } from "@/domain/money";
import type { DealContext } from "@/ai/orchestrator";
import { appliedRules, auditSources, branchAudit, whoDidWhat } from "@/lib/audit";
import { SAMPLE_OUTPUT_LABEL, taskOrRunProvenance } from "@/lib/model-provenance";
import { strategyViewOf, type DemoState } from "@/lib/service";
import { activeVersionOf } from "@/lib/views";
import { fmtTime } from "../evidence";

/**
 * The merchant's read-only audit (spec §8.3). Links only: no forms, buttons or actions. Technical
 * detail (offsets, hashes, idempotency keys) sits under "Advanced details".
 */
const NAV: [string, string][] = [
  ["audit-evidence", "Evidence"],
  ["audit-rules", "Applied merchant rules"],
  ["audit-history", "Approval and acceptance history"],
  ["audit-economics", "Calculation provenance"],
  ["audit-who", "Who did what"],
  ["audit-schedules", "Schedules"],
];

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="scroll-mt-4 pt-2 text-[15px] font-semibold text-ink">
      {children}
    </h3>
  );
}

function offerStructure(s: DemoState, out: RunOutcome): EvaluatedStructure | null {
  const v = activeVersionOf(s.agreements) ?? [...s.agreements].reverse().find((a) => a.status !== "draft") ?? null;
  if (v) return s.amendments.find((a) => a.toVersion === v.version)?.revised ?? out.evaluation.result?.structures.find((x) => x.structure.id === v.structureId) ?? null;
  const id = s.selectedOption?.structureId ?? strategyViewOf(s, out).leader?.structure.id;
  return out.evaluation.result?.structures.find((x) => x.structure.id === id) ?? null;
}

export function AuditSections({ s, out, deal }: { s: DemoState; out: RunOutcome; deal: DealContext }) {
  const run = s.run.record;
  const policy = deal.merchant.policy;
  const sources = auditSources(s, run, s.run.viewing, deal.packages);
  const who = whoDidWhat(run, out.explanation?.source ?? null, s, s.run.viewing, out.explanation?.notes.length ?? 0);
  const branch = branchAudit(s, out, taskOrRunProvenance(run, "explain", s.run.viewing));
  // Model outputs and hand-written samples keep separate headings; a case with no model output says so.
  const modelRows: (readonly [string, string[]])[] = [
    who.aiLabel ? ([`AI · ${who.aiLabel}`, who.ai] as const) : (["AI", ["No model ran for this case."]] as const),
    ...(who.sample.length ? [[SAMPLE_OUTPUT_LABEL, who.sample] as const] : []),
  ];
  const x = offerStructure(s, out);
  const e = x?.economics;
  return (
    <div className="space-y-4 text-[13px] text-ink-2" data-testid="audit-sections">
      <nav aria-label="Audit sections" className="flex flex-wrap gap-x-3 gap-y-1">
        {NAV.map(([id, label]) => (
          <a key={id} href={`#${id}`} data-audit-nav className="font-semibold text-blue hover:underline">
            {label}
          </a>
        ))}
      </nav>

      <section aria-labelledby="audit-evidence">
        <H id="audit-evidence">Evidence</H>
        <ul className="mt-1 space-y-1">
          {sources.map((x, i) => (
            <li key={`${x.item}-${i}`}>
              <span className="font-medium text-ink">{x.item}</span> · Source: {x.source}
            </li>
          ))}
        </ul>
        <details className="mt-2 rounded-lg border border-line px-3 py-1.5">
          <summary className="cursor-pointer font-semibold text-ink">Advanced details</summary>
          <ul className="mt-1 space-y-1 pb-1 text-[12px]">
            {sources.filter((x) => x.detail).map((x, i) => (
              <li key={`${x.item}-${i}`}>
                {x.item}: {x.detail}
              </li>
            ))}
          </ul>
        </details>
      </section>

      {branch ? (
        <section aria-labelledby="audit-branch" data-testid="branch-audit">
          <H id="audit-branch">Decision branch</H>
          <p>{branch.notice}</p>
          <ul className="mt-2 space-y-1">
            {branch.answers.map((answer) => (
              <li key={answer.questionId}>
                <span className="font-medium text-ink">{answer.questionId}</span> · “{answer.answerText}” → {answer.value} · confirmed via {answer.confirmedByBuyerVia}
              </li>
            ))}
            {branch.scope ? (
              <li data-testid="branch-scope">
                <span className="font-medium text-ink">Required services</span> · merchant confirmed {branch.scope.packageIds.map((id) => deal.packages.find((p) => p.id === id)?.name ?? id).join(", ")} from “{branch.scope.sources.map((x) => x.rawText).join("”, “")}”
              </li>
            ) : null}
          </ul>
          <details className="mt-2 rounded-lg border border-line px-3 py-1.5">
            <summary className="cursor-pointer font-semibold text-ink">Advanced details</summary>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pb-1 font-mono text-[12px]">
              <dt>Parent run</dt><dd className="break-all">{branch.parentRunId}</dd>
              <dt>Branch</dt><dd className="break-all">{branch.branchId}</dd>
              <dt>Engine result</dt><dd className="break-all">{branch.engineFingerprint}</dd>
              <dt>Explanation</dt><dd>{branch.explanationSource}</dd>
            </dl>
          </details>
        </section>
      ) : null}

      <section aria-labelledby="audit-rules">
        <H id="audit-rules">Applied merchant rules</H>
        <p className="text-[12px] text-muted">From the merchant&apos;s configuration (synthetic fixture). Read-only in this prototype.</p>
        <ul className="mt-1 space-y-2">
          {appliedRules(policy, deal.templates, deal.packages).map((r) => (
            <li key={r.id} data-rule={r.id} className="rounded-lg border border-line px-3 py-2">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold text-ink">{r.name}</span>
                <span className="tabular">{r.value}</span>
              </div>
              <div className="text-[12px]">{r.detail}</div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="audit-history">
        <H id="audit-history">Approval and acceptance history</H>
        {s.reviewRequired ? <p className="rounded-lg bg-amber-weak px-3 py-2 text-amber">Records need review: {s.reviewRequired}</p> : null}
        {s.agreements.length ? (
          <ul className="mt-1 space-y-1">
            {s.agreements.map((v) => (
              <li key={v.version}>
                <span className="font-medium text-ink">Version {v.version}</span> · {v.status.replace(/_/g, " ")}
                {v.merchantApproval ? ` · approved by ${v.merchantApproval.by}, ${fmtTime(v.merchantApproval.at)}` : ""}
                {v.buyerAcceptance ? ` · accepted by the buyer, ${fmtTime(v.buyerAcceptance.at)}` : ""}
                {v.buyerDecline ? ` · declined by the buyer, ${fmtTime(v.buyerDecline.at)}` : ""}
              </li>
            ))}
            {s.deliveries.map((d) => (
              <li key={`d${d.version}`}>
                Delivery of version {d.version} ({d.kind}): {d.attempts.map((a) => `${a.status} ${fmtTime(a.at)}${a.failureReason ? ` (${a.failureReason})` : ""}`).join(", ") || "no attempts"}
              </li>
            ))}
          </ul>
        ) : (
          <p>No terms have been prepared yet.</p>
        )}
        <details className="mt-2 rounded-lg border border-line px-3 py-1.5">
          <summary className="cursor-pointer font-semibold text-ink">Advanced details</summary>
          <ul className="mt-1 space-y-1 pb-1 font-mono text-[12px]">
            {s.agreements.map((v) => (
              <li key={v.version} className="break-all">
                v{v.version} terms hash {v.termsHash}
                {v.merchantApproval ? ` · merchant ${v.merchantApproval.termsHash === v.termsHash ? "same hash" : "DIFFERENT HASH"}` : ""}
                {v.buyerAcceptance ? ` · buyer ${v.buyerAcceptance.termsHash === v.termsHash ? "same hash" : "DIFFERENT HASH"}` : ""}
              </li>
            ))}
            {s.deliveries.map((d) => (
              <li key={`k${d.version}`} className="break-all">
                delivery key {d.idempotencyKey}
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section aria-labelledby="audit-economics">
        <H id="audit-economics">Calculation provenance</H>
        {x && e ? (
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt>Offer</dt>
            <dd className="text-ink">{x.structure.label}</dd>
            <dt>Customer total</dt>
            <dd className="tabular">
              {formatINR(x.structure.pricePaise)} pre-GST + GST {formatINR(sum(x.structure.payments.map((p) => p.gstPaise)))} = {formatINR(sum(x.structure.payments.map((p) => p.totalPaise)))} (GST per line, half-up, {policy.gstRateBps / 100}%)
            </dd>
            <dt>Projected contribution</dt>
            <dd className="tabular">
              {formatINR(e.pricePaise)} − direct costs {formatINR(e.directCostPaise)} − expected payment fees {formatINR(e.expectedFeesPaise)} ({policy.paymentFeeBps / 100}%) = {formatINR(e.netContributionPaise)}
            </dd>
            <dt>Peak funding requirement</dt>
            <dd className="tabular">
              {formatINR(e.peakFundingPaise)}
              {e.peakFundingDate ? ` on ${formatDate(e.peakFundingDate)}` : ""} · limit {formatINR(policy.cashAtRiskLimitPaise)}
            </dd>
            <dt>Inputs</dt>
            <dd>Package prices and direct costs from the synthetic fixture; costs committed at the start of each delivery month; payments collected on their due dates.</dd>
          </dl>
        ) : (
          <p>No offer has been calculated yet.</p>
        )}
      </section>

      <section aria-labelledby="audit-who">
        <H id="audit-who">Who did what</H>
        <dl className="mt-1 space-y-2">
          {(
            [
              ...modelRows,
              ["Code", who.code],
              ["Merchant", who.merchant],
              ["Buyer", who.buyer],
            ] as const
          ).map(([k, xs]) => (
            <div key={k}>
              <dt className="font-semibold text-ink">{k}</dt>
              <dd>{xs.length ? xs.join(" · ") : "Nothing yet"}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="audit-schedules">
        <H id="audit-schedules">Schedules</H>
        {x ? (
          <>
            <div className="mt-1 font-medium text-ink">Delivery</div>
            <ul>
              {x.structure.deliveries.map((d, i) => (
                <li key={i}>
                  {d.month} · {d.packageName} · {formatINR(d.valuePaise)}
                </li>
              ))}
            </ul>
            <div className="mt-2 font-medium text-ink">Invoices</div>
            <ul>
              {x.structure.invoices.map((iv) => (
                <li key={iv.id}>
                  {iv.id} · {formatDate(iv.invoiceDate)} · {formatINR(iv.totalPaise)} incl. GST {formatINR(iv.gstPaise)}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <div className="mt-2 font-medium text-ink">Collection attempts</div>
        {s.attempts.length ? (
          <ul>
            {s.attempts.map((a) => (
              <li key={a.id}>
                {formatDate(a.dueDate)} · {a.scheduleLineId} · {formatINR(a.amountPaise)} · {a.status} · version {a.agreementVersion}
                {a.origin === "internal_retry" ? " · internal retry" : a.origin === "amendment" ? " · revised" : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p>No collection is scheduled yet.</p>
        )}
        <details className="mt-2 rounded-lg border border-line px-3 py-1.5">
          <summary className="cursor-pointer font-semibold text-ink">Advanced details</summary>
          <ul className="mt-1 space-y-0.5 pb-1 font-mono text-[12px]">
            {s.attempts.map((a) => (
              <li key={a.id} className="break-all">
                {a.id} · {a.idempotencyKey}
              </li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  );
}
