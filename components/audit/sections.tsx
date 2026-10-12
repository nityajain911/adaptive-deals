import type { RunOutcome } from "@/ai/orchestrator";
import { formatDate } from "@/domain/dates";
import type { EvaluatedStructure } from "@/domain/engine";
import { formatINR, sum } from "@/domain/money";
import type { DealContext } from "@/ai/orchestrator";
import { appliedRules, auditSources, branchAudit, executionPipeline, merchantExceptions, modelHeader, whoDidWhat, type PipelineStep } from "@/lib/audit";
import type { Reproduction } from "@/lib/reproducibility";
import { CopyButton } from "../copy-button";
import { McpCapabilityMap } from "../mcp/capability-map";
import { taskOrRunProvenance } from "@/lib/model-provenance";
import { strategyViewOf, type DemoState } from "@/lib/service";
import { activeVersionOf } from "@/lib/views";
import { fmtTime } from "../evidence";
import { isIllustrativeHash } from "@/lib/economics-illustrative";
import { Rejections } from "../offer/recommendation";
import type { CommercialMemoryDealView } from "@/lib/commercial-memory-view";

/**
 * The merchant's read-only audit (spec §8.3). Links only: no forms, buttons or actions. Technical
 * detail (offsets, hashes, idempotency keys) sits under "Advanced details".
 */
const NAV: [string, string][] = [
  ["audit-evidence", "Evidence"],
  ["audit-memory", "Commercial Memory"],
  ["audit-rules", "Applied merchant rules"],
  ["audit-ruled-out", "Offers ruled out"],
  ["audit-exceptions", "Exceptions and overrides"],
  ["audit-history", "Approval and acceptance history"],
  ["audit-economics", "Calculation provenance"],
  ["audit-who", "System execution pipeline"],
  ["audit-schedules", "Schedules"],
  ["audit-mcp", "Razorpay MCP action"],
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

export function AuditSections({ s, out, deal, memory = null, reproduced = null }: { s: DemoState; out: RunOutcome; deal: DealContext; memory?: CommercialMemoryDealView | null; reproduced?: Reproduction | null }) {
  const run = s.run.record;
  const policy = deal.merchant.policy;
  const sources = auditSources(s, run, s.run.viewing, deal.packages);
  const conversationRows = sources.filter((x) => x.evidence?.length);
  // Model-task lines (which carry a run id) are shown once, in the pipeline below; the ids stay in Advanced details.
  const otherSources = sources.filter((x) => !x.evidence?.length && !x.source.includes(" run "));
  const who = whoDidWhat(run, out.explanation?.source ?? null, s, s.run.viewing, out.explanation?.notes.length ?? 0);
  const branch = branchAudit(s, out, taskOrRunProvenance(run, "explain", s.run.viewing));
  // Model outputs and hand-written samples keep separate headings; a case with no model output says so.
  const memoryByService = memory ? [...new Map(memory.merchantEvidence.map((item) => [item.serviceId, item.serviceName])).entries()].map(([serviceId, serviceName]) => ({ serviceId, serviceName, items: memory.merchantEvidence.filter((item) => item.serviceId === serviceId) })) : [];
  const header = modelHeader(run, s.run.viewing);
  const pipeline = executionPipeline(who);
  const exceptions = merchantExceptions(s, Object.fromEntries(deal.packages.map((p) => [p.id, p.name])));
  const x = offerStructure(s, out);
  const e = x?.economics;
  return (
    <div className="space-y-4 text-[13px] text-ink-2" data-testid="audit-sections">
      <nav aria-label="Audit sections" className="flex flex-wrap gap-x-3 gap-y-1">
        {NAV.filter(([id]) => id !== "audit-memory" || memory).map(([id, label]) => (
          <a key={id} href={`#${id}`} data-audit-nav className="font-semibold text-blue hover:underline">
            {label}
          </a>
        ))}
      </nav>

      <section aria-labelledby="audit-evidence">
        <H id="audit-evidence">Evidence</H>
        {conversationRows.length ? (
          <div className="mt-1" data-testid="audit-evidence-table">
            <p className="text-[12px] text-muted">Source: Simulated WhatsApp conversation. Every quote below is copied verbatim from it and was checked by code.</p>
            <div className="mt-2 overflow-hidden rounded-xl border border-line" role="table" aria-label="Values read from the conversation, with their quotes">
              <div role="row" className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-3 border-b border-line bg-surface-muted px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-muted sm:grid"><span role="columnheader">Extracted value</span><span role="columnheader">Source quote</span></div>
              <div className="divide-y divide-line">
                {conversationRows.map((row, i) => (
                  <div key={`${row.item}-${i}`} role="row" className="grid gap-x-3 gap-y-1 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
                    <div role="cell"><span className="block font-medium text-ink">{row.item}</span>{row.value ? <span className="block text-ink-2">{row.value}</span> : null}</div>
                    <div role="cell" className="space-y-1">{[...new Set(row.evidence!.map((e) => e.quote))].map((quote, j) => <blockquote key={j} className="border-l-2 border-blue pl-2 text-ink">“{quote}”</blockquote>)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        <ul className="mt-2 space-y-1">
          {otherSources.map((x, i) => (
            <li key={`${x.item}-${i}`}>
              <span className="font-medium text-ink">{x.item}</span> · Source: {x.source}
            </li>
          ))}
        </ul>
        <details className="mt-2 rounded-lg border border-line px-3 py-1.5">
          <summary className="cursor-pointer font-semibold text-ink">Advanced details</summary>
          <ul className="mt-1 space-y-1 pb-1 text-[12px]">
            {sources.filter((x) => x.advanced ?? x.detail).map((x, i) => (
              <li key={`${x.item}-${i}`}>
                {x.item}: {x.advanced ?? x.detail}
              </li>
            ))}
          </ul>
        </details>
      </section>

      {memory ? <section aria-labelledby="audit-memory" data-testid="audit-commercial-memory">
        <H id="audit-memory">Commercial Memory</H>
        <p className="text-[12px] text-muted">Exact quotes retrieved by code from the merchant&apos;s documents, grouped by service. Source access rules were applied before ranking. Nothing here was written by a model.</p>
        {memory.history ? <p className="mt-1"><span className="font-medium text-ink">Buyer history</span> · {memory.history.sourceTitle} · {memory.history.effectiveFrom} <CopyButton value={memory.history.chunkId} label="chunk id" /></p> : <p className="mt-1 text-muted">No eligible buyer history was used.</p>}
        <ul className="mt-2 space-y-2">
          {memoryByService.map((group) => (
            <li key={group.serviceId} className="rounded-lg border border-line px-3 py-2" data-testid={`memory-service-${group.serviceId}`}>
              <div className="font-semibold text-ink">{group.serviceName} <span className="font-normal text-muted">· {group.items.length} quote{group.items.length === 1 ? "" : "s"} from {new Set(group.items.map((item) => item.sourceId)).size} document{new Set(group.items.map((item) => item.sourceId)).size === 1 ? "" : "s"}</span></div>
              <ul className="mt-1 space-y-1">
                {group.items.map((item) => (
                  <li key={`${item.serviceId}-${item.kind}`}>
                    <span className="font-medium text-ink">{item.kind === "price" ? "Price" : "Cost"}</span> · {item.sourceTitle} · from {item.effectiveFrom}
                    <blockquote className="mt-0.5 border-l-2 border-blue pl-2 text-ink">“{item.quote}”</blockquote>
                    <span className="text-[12px] text-muted">exact quote, retrieved by code </span><CopyButton value={item.chunkId} label="chunk id" />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section> : null}

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
            <dl className="mt-1 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 pb-1 text-[12px]">
              <dt>Parent run</dt><dd><CopyButton value={branch.parentRunId} label="parent run id" text /></dd>
              <dt>Branch</dt><dd><CopyButton value={branch.branchId} label="branch id" text /></dd>
              <dt>Engine result</dt><dd><CopyButton value={branch.engineFingerprint} label="engine fingerprint" text /></dd>
              <dt>Explanation</dt><dd>{branch.explanationSource}</dd>
            </dl>
          </details>
        </section>
      ) : null}

      <section aria-labelledby="audit-rules">
        <H id="audit-rules">Applied merchant rules</H>
        <p className="text-[12px] text-muted">From your prices & costs, version {s.economics.pinned.version}{isIllustrativeHash(s.economics.pinned.hash) ? " (illustrative example)" : ""}{s.economics.overrides.length ? `, with ${s.economics.overrides.length} deal override${s.economics.overrides.length === 1 ? "" : "s"}` : ""}. Synthetic demo data, read-only here.</p>
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

      {out.evaluation.result ? (
        <section aria-labelledby="audit-ruled-out" data-testid="audit-ruled-out">
          <H id="audit-ruled-out">Offers ruled out</H>
          <Rejections r={out.evaluation.result} />
        </section>
      ) : null}

      <section aria-labelledby="audit-exceptions" data-testid="audit-exceptions">
        <H id="audit-exceptions">Exceptions and overrides</H>
        <p className="text-[12px] text-muted">What you chose to do outside the engine&apos;s own result. The engine&apos;s verdict is never changed.</p>
        {exceptions.inputOverrides.length || exceptions.failedRuleExceptions.length || exceptions.history.length ? (
          <div className="mt-1 space-y-3">
            <div data-testid="audit-input-overrides">
              <h4 className="font-semibold text-ink">Assumptions changed for this deal</h4>
              {exceptions.inputOverrides.length ? (
                <ul className="mt-1 space-y-1.5">
                  {exceptions.inputOverrides.map((o) => (
                    <li key={o.what} className="rounded-lg border border-line px-3 py-2">
                      <div className="font-medium text-ink">{o.what}</div>
                      <div>{o.direction} · reason: {o.reason}</div>
                      <div className="text-[12px] text-muted">{o.by} · {fmtTime(o.at)} · prices & costs version {o.economicsVersion}</div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-muted">None are applied now.</p>}
              {exceptions.history.length ? (
                <ul className="mt-1 space-y-1 text-[12px] text-muted">
                  {exceptions.history.map((h) => <li key={`${h.at}-${h.title}`}>{fmtTime(h.at)} · {h.title}{h.detail ? ` · ${h.detail}` : ""}</li>)}
                </ul>
              ) : null}
            </div>
            <div data-testid="audit-failed-rule-exceptions">
              <h4 className="font-semibold text-ink">Amounts sent although a rule failed</h4>
              {exceptions.failedRuleExceptions.length ? (
                <ul className="mt-1 space-y-1.5">
                  {exceptions.failedRuleExceptions.map((x) => (
                    <li key={x.at} className="rounded-lg border border-[#f7dfb4] bg-amber-weak/40 px-3 py-2">
                      <div className="font-medium text-ink">Counter-offer at {x.total}{x.negativeContribution ? " · below direct costs" : ""}</div>
                      {x.rules.length ? <div>Rules overridden: {x.rules.join("; ")}</div> : null}
                      <div>Reason: {x.reason}</div>
                      <div className="text-[12px] text-muted">{x.by} · {fmtTime(x.at)}{x.economicsVersion !== null ? ` · prices & costs version ${x.economicsVersion}` : ""}</div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-muted">None.</p>}
            </div>
          </div>
        ) : <p className="mt-1 text-muted">You have not overridden an assumption or sent an amount that failed a rule.</p>}
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
          <ul className="mt-1 space-y-1.5 pb-1 text-[12px]">
            {s.agreements.map((v) => (
              <li key={v.version}>
                v{v.version} terms <CopyButton value={v.termsHash} label="terms hash" text />
                {v.merchantApproval ? ` · merchant approved ${v.merchantApproval.termsHash === v.termsHash ? "the same terms" : "DIFFERENT TERMS"}` : ""}
                {v.buyerAcceptance ? ` · buyer accepted ${v.buyerAcceptance.termsHash === v.termsHash ? "the same terms" : "DIFFERENT TERMS"}` : ""}
              </li>
            ))}
            {s.deliveries.map((d) => (
              <li key={`k${d.version}`}>
                v{d.version} delivery <CopyButton value={d.idempotencyKey} label="delivery key" text />
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

      <section aria-labelledby="audit-who" data-testid="audit-pipeline">
        <H id="audit-who">System execution pipeline</H>
        <div className="mt-1 flex flex-wrap items-center gap-2" data-testid="audit-pipeline-header">
          <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[12px] font-semibold text-ink" data-testid="audit-model-header">{header.label}{header.detail ? ` · ${header.detail}` : ""}</span>
          {reproduced ? <ReproducedBadge result={reproduced} /> : null}
        </div>
        <div aria-hidden className="mt-3 hidden grid-cols-2 gap-2 text-[12px] font-bold uppercase tracking-wide text-muted sm:grid" data-testid="audit-lane-headers">
          <span>{header.kind === "single" ? "AI · text and extraction" : header.kind === "sample" ? "Hand-written sample · no model" : header.kind === "mixed" ? "AI and samples · text" : "Text and extraction"}</span>
          <span>Rules engine · margins, schedules, checks</span>
        </div>
        <ol className="mt-1.5 space-y-2" aria-label="Steps, in the order they happened">
          {pipeline.map((step, i) => <PipelineRow key={i} step={step} index={i + 1} />)}
        </ol>
        {!pipeline.some((step) => step.actor === "ai") ? <p className="mt-2 text-muted" data-testid="audit-no-model">No model ran for this case.</p> : null}
        <details className="mt-3 rounded-lg border border-line px-3 py-1.5">
          <summary className="cursor-pointer font-semibold text-ink">Advanced details</summary>
          <ul className="mt-1 space-y-1 pb-1 text-[12px]">
            {run.steps.map((step, index) => <li key={`${step.task}-${index}`}>{step.task} · {step.promptVersion} · {step.outcome.replace(/_/g, " ")} · {step.provider} / {step.model}{step.issues.length ? ` · ${step.issues.join("; ")}` : ""}</li>)}
            <li>Run <CopyButton value={run.runId} label="run id" /></li>
          </ul>
        </details>
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
          <ul className="mt-1 space-y-1.5 pb-1 text-[12px]">
            {s.attempts.map((a) => (
              <li key={a.id}>
                {formatDate(a.dueDate)} attempt <CopyButton value={a.id} label="attempt id" text /> <CopyButton value={a.idempotencyKey} label="idempotency key" text />
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section aria-labelledby="audit-mcp" data-testid="audit-mcp">
        <H id="audit-mcp">Razorpay MCP action</H>
        <p className="mt-1">Capability unavailable in this environment · no Razorpay MCP tool was called.</p>
        <p>The collection records above are separately labelled simulated events. A future test-mode action must bind the exact agreement, terms hash, arguments hash and advertised tool catalog before merchant approval.</p>
        <div className="mt-3"><h4 className="font-semibold text-ink">What Razorpay offers for each part of a deal</h4><div className="mt-1"><McpCapabilityMap /></div></div>
      </section>
    </div>
  );
}

const LANE_CHIP: Record<PipelineStep["actor"], { label: string; className: string }> = {
  ai: { label: "AI", className: "bg-violet-weak text-violet" },
  sample: { label: "Hand-written sample", className: "bg-amber-weak text-amber" },
  code: { label: "Rules engine", className: "bg-blue-weak text-blue-ink" },
  merchant: { label: "Merchant", className: "bg-green-weak text-green" },
  buyer: { label: "Buyer (simulated)", className: "bg-surface-muted text-ink-2" },
};

/** One step of the pipeline. AI work sits in the left lane, the rules engine's deterministic work in the right, and people's decisions across the full width. */
function PipelineRow({ step, index }: { step: PipelineStep; index: number }) {
  const chip = LANE_CHIP[step.actor];
  const body = (
    <div className={`rounded-lg border px-3 py-2 ${step.lane === "people" ? "border-line bg-surface" : step.lane === "ai" ? "border-[#ddd5ff] bg-violet-weak/40" : "border-[#d6defe] bg-blue-weak/40"}`} data-lane={step.lane}>
      <span className={`mr-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${chip.className}`}>{chip.label}</span>
      <span className="text-ink">{step.text}</span>
    </div>
  );
  return (
    <li className="grid gap-2 sm:grid-cols-2" data-step={index} data-actor={step.actor}>
      {step.lane === "ai" ? <>{body}<div aria-hidden className="hidden sm:block" /></> : step.lane === "code" ? <><div aria-hidden className="hidden sm:block" />{body}</> : <div className="sm:col-span-2">{body}</div>}
    </li>
  );
}

/** Green only when the stored run replays to exactly the same result; otherwise red, with the reason. */
export function ReproducedBadge({ result }: { result: Reproduction }) {
  return result.ok ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#dff7e8] px-2.5 py-1 text-[12px] font-bold text-[#0a6b3a]" data-testid="reproduced-badge" title="The stored run replays to exactly the same engine result and displayed text, with no model call.">✅ Reproduced</span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-weak px-2.5 py-1 text-[12px] font-bold text-red" data-testid="reproduced-badge" title={result.reason}>Not reproduced · {result.reason.slice(0, 80)}</span>
  );
}
