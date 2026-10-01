import Link from "next/link";
import { readingLabel } from "@/domain/copy";
import { derivePreGstFromInclusive, formatINR } from "@/domain/money";
import { AnswerForm, type QuestionInput } from "@/components/client";
import { fmtTime } from "@/components/evidence";
import { Badge, Card, CardHeader, Empty, Label, Notice, Table } from "@/components/ui";
import { loadPage } from "@/lib/page-data";

const OPTIONS: Record<string, QuestionInput["options"]> = {
  amountsIncludeGst: [
    { value: "yes", label: "Yes, both include GST", answerText: "Yes, both amounts include GST." },
    { value: "no", label: "No, both exclude GST", answerText: "No, both amounts exclude GST." },
  ],
  approvalScope: [
    { value: "per_contract", label: "Per contract", answerText: "₹60,000 is per contract." },
    { value: "per_payment", label: "Per payment", answerText: "₹60,000 is per payment." },
  ],
};

export default async function ClarificationPage() {
  const { s, out } = await loadPage();
  const r = s.run.record;
  const questions = r.displayed.questions;
  const initial = r.engine.initial;
  const answers = r.inputs.answers;
  const gstRate = s.run.record.inputs.policy.gstRateBps;
  const amounts = [out.profile.budgetNow.value?.amountPaise, out.profile.approvalLimit.value?.amountPaise].filter((x): x is number => x != null);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="space-y-5">
        {questions.length === 0 ? <Empty>No clarification is needed for this run.</Empty> : null}
        {questions.map((q) => {
          const impact = initial.ambiguities.find((a) => a.field === q.field)!;
          const answer = answers.find((a) => a.questionId === q.id);
          return (
            <Card key={q.id} aria-labelledby={q.id} data-testid={`question-${q.id}`}>
              <CardHeader
                id={q.id}
                title={q.question}
                meta={
                  <>
                    <Label kind={q.wording === "ai" ? "ai" : "code_fallback"} />
                    <Badge tone="amber">Changes the decision</Badge>
                    <span className="font-mono text-[11px]">{q.id}</span>
                  </>
                }
              />
              <div className="space-y-4 p-5">
                <div>
                  <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
                    Why it matters <Label kind="engine" />
                  </div>
                  <p className="mt-1 text-[14px] leading-6 text-ink-2" data-testid={`why-${q.id}`}>
                    {q.whyItMatters}
                  </p>
                </div>
                <Table
                  caption="Options by reading"
                  head={["Reading", "Feasible options", "Within approval limit", "Options that change"]}
                  rows={impact.readings.map((rd) => [readingLabel(rd).replace(/^./, (c) => c.toUpperCase()), impact.feasibleCountByReading[rd], impact.withinLimitCountByReading[rd], impact.differingStructures.length])}
                />
                {answer ? (
                  <div className="rounded-xl border border-[#c9eedd] bg-green-weak p-4 text-[13px]" data-testid={`recorded-${q.id}`}>
                    <div className="font-semibold text-ink">Answer: {answer.answerText}</div>
                    <div className="mt-1 text-ink-2">
                      Recorded by {answer.recordedBy} · Confirmed by buyer via {answer.confirmedByBuyerVia === "whatsapp" ? "WhatsApp" : answer.confirmedByBuyerVia === "email" ? "Email" : "Call"} · {fmtTime(answer.answeredAt)}
                    </div>
                    {q.covers.length > 1 ? <div className="mt-1 text-ink-2">This answer explicitly covers both stated amounts.</div> : null}
                  </div>
                ) : null}
              </div>
            </Card>
          );
        })}
        {s.status === "clarifying" && questions.length ? (
          <Card aria-labelledby="record">
            <CardHeader id="record" title="Record the buyer's answers" meta={<span>Ask the buyer outside the product, then record what they confirmed</span>} />
            <div className="p-5">
              <AnswerForm questions={questions.map((q) => ({ id: q.id, question: q.question, options: OPTIONS[q.field] ?? [] }))} />
            </div>
          </Card>
        ) : null}
      </div>

      <div className="space-y-5">
        <Card aria-labelledby="derived">
          <CardHeader id="derived" title="GST-inclusive amounts, derived" meta={<Label kind="engine" />} />
          <div className="p-5">
            {out.profile.amountsIncludeGst.value === "yes" ? (
              <Table
                caption="Pre-GST derivation"
                head={["Stated (incl. GST)", "Pre-GST", "GST", "Reconciliation"]}
                rows={amounts.map((a) => {
                  const d = derivePreGstFromInclusive(a, gstRate);
                  return [formatINR(d.inclusivePaise, { paise: true }), formatINR(d.prePaise, { paise: true }), formatINR(d.gstPaise, { paise: true }), formatINR(d.reconciliationPaise, { paise: true })];
                })}
              />
            ) : (
              <Empty>{answers.length ? "Amounts were confirmed as excluding GST; no derivation is needed." : "Shown once the buyer confirms whether the amounts include GST."}</Empty>
            )}
            <p className="mt-3 text-[12px] text-muted">Rule: the largest pre-GST amount whose GST at {gstRate / 100}% (per line, rounded half-up to the paise) keeps the total within the stated amount. Any residual is shown as the reconciliation difference.</p>
          </div>
        </Card>
        <Notice tone="blue" title="How these questions were chosen">
          Code compared every reading of each unresolved fact across all templates and kept only the facts whose answer changes which options are possible. The AI words the questions; it cannot add others or supply figures.
        </Notice>
        {s.status !== "clarifying" && answers.length ? (
          <Link href="/decision" className="inline-block text-[13px] font-semibold text-blue hover:underline">
            Go to decision →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
