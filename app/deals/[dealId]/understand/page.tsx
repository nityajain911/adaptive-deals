import Link from "next/link";
import { ConversationThread } from "@/components/conversation-thread";
import { ConfirmServicesForm, InterpretForm, PrimaryActionButton } from "@/components/client";
import { StageShell } from "@/components/deal/stage-shell";
import { ConfirmedServices, ScopeConfirmationCard } from "@/components/understand/scope-confirmation";
import { InfoButton } from "@/components/info-button";
import { Card } from "@/components/ui";
import { understandSummary } from "@/lib/stage-summary";
import { loadDeal, stageHref } from "@/lib/deal-page";
import { originalProposalOf } from "@/lib/deal-context";
import { blockingLines, uncapturedLines } from "@/lib/understand-copy";
import { decisionAnswers, latestClarificationForQuestion, unmappedScopeOf } from "@/lib/service";
import { branchChangedAnswers } from "@/lib/decision-branch";
import { commercialMemoryForDeal } from "@/lib/commercial-memory-view";
import { loadKnowledgeSources } from "@/lib/knowledge";
import { RelevantHistory } from "@/components/commercial-memory/deal-evidence";

const INTERPRET_OPTIONS: Record<string, { value: string; label: string }[]> = {
  "clar-gst": [
    { value: "yes", label: "Includes GST" },
    { value: "no", label: "Excludes GST" },
  ],
  "clar-approval": [
    { value: "per_contract", label: "Per contract" },
    { value: "per_payment", label: "Per payment" },
  ],
};

/** Stage 1 · Understand the buyer (spec §4). */
export default async function UnderstandPage(props: PageProps<"/deals/[dealId]/understand">) {
  const { dealId } = await props.params;
  const { s, out, progress, activeCase, baseline } = await loadDeal(dealId);
  const current = progress.stages.understand === "current";
  const r = s.run.record;
  const lines = blockingLines(out.profile, originalProposalOf(baseline));
  const uncaptured = uncapturedLines(out.evaluation);
  const unmapped = unmappedScopeOf(s, out);
  const scope = s.decisionBranch?.scope ?? null;
  const packages = activeCase.deal.packages;
  const confirmedServices = scope ? <ConfirmedServices names={scope.packageIds.map((id) => packages.find((p) => p.id === id)?.name ?? id)} phrases={scope.sources.map((x) => x.rawText)} /> : null;
  const evidence = r.engine.profile.filter((f) => f.evidence.length);
  const answers = decisionAnswers(s);
  const primary = current ? progress.primaryAction : null;
  const memory = commercialMemoryForDeal({ merchantId: activeCase.deal.merchant.id, buyerId: activeCase.buyer.id, asOf: "2026-10-08", serviceIds: packages.map((item) => item.id) }, await loadKnowledgeSources());

  const questions = r.displayed.questions.map((q) => {
    const draft = latestClarificationForQuestion(s, q.id);
    const reply = draft ? ([...s.conversation].reverse().find((i) => i.inReplyTo === draft.id) ?? null) : null;
    const answer = answers.find((a) => a.questionId === q.id) ?? null;
    return { q, draft, reply, answer };
  });

  const evidenceDetails = (
    <details className="mt-3 rounded-xl border border-line bg-surface-muted px-4 py-2" data-testid="see-evidence" data-walkthrough="constraint-evidence">
      <summary className="cursor-pointer text-[13px] font-semibold text-ink">Where this came from</summary>
      <ul className="mt-2 space-y-2 pb-2 text-[13px] text-ink-2">
        <li>
          <span className="font-semibold text-ink">Original annual proposal</span> · Source: synthetic deal fixture · ₹1,20,000 pre-GST annual scope at list price + 18% GST = ₹1,41,600
        </li>
        {evidence.map((f) => (
          <li key={f.key}>
            <span className="font-semibold text-ink">{f.label}</span> · Source: simulated WhatsApp conversation · {f.evidence.map((e) => `“${e.quote}”`).join(" ")}
            {f.confirmedBy ? ` · confirmed in a clarification reply` : ""}
          </li>
        ))}
        {s.decisionBranch && branchChangedAnswers(s.decisionBranch)
          ? answers.map((answer) => (
              <li key={`branch-${answer.questionId}`}>
                <span className="font-semibold text-ink">Changed clarification · {answer.questionId}</span> · Source: buyer clarification recorded by merchant · “{answer.answerText}”
              </li>
            ))
          : null}
      </ul>
    </details>
  );

  if (!current) {
    return (
      <StageShell dealId={dealId} viewing="understand">
        <Card className="p-5" data-testid="understand-settled">
          <div className="text-[15px] font-semibold text-ink">
            What the buyer needs is confirmed
          </div>
          <p className="mt-1 text-[14px] text-ink-2" data-testid="understand-summary">{understandSummary(out.profile, Object.fromEntries(packages.map((p) => [p.id, p.name])))}</p>
          <Link href={stageHref(dealId, progress.stage)} className="mt-2 inline-block text-[13px] font-semibold text-blue hover:underline">
            Continue →
          </Link>
          <details className="mt-3 rounded-xl border border-line px-4 py-2">
            <summary className="cursor-pointer text-[13px] font-semibold text-ink">Details</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-ink-2">
              {lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
              {uncaptured.map((l) => (
                <li key={l} data-testid="uncaptured">{l}</li>
              ))}
            </ul>
            {confirmedServices ? <div className="mt-3">{confirmedServices}</div> : null}
            {questions.length ? (
              <dl className="mt-3 space-y-2 text-[13px]">
                {questions.map(({ q, answer }) => (
                  <div key={q.id}>
                    <dt className="font-semibold text-ink">{q.question}</dt>
                    <dd className="text-ink-2">{answer ? `“${answer.answerText}”` : "Not answered"}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {evidenceDetails}
            <div className="mt-4">
              <ConversationThread s={s} scope="understand" buyerName={activeCase.buyer.name} opening={r.inputs.messages} showDrafts={questions.length === 0} />
            </div>
          </details>
        </Card>
      </StageShell>
    );
  }

  return (
    <StageShell dealId={dealId} viewing="understand">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-5">
          <Card className="p-5" data-testid="blocking-card">
            <h2 className="text-[16px] font-semibold text-ink">What&apos;s in the way</h2>
            <ul className="mt-2 space-y-1.5 text-[14px] text-ink">
              {lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
              {uncaptured.map((l) => (
                <li key={l} className="text-[13px] text-ink-2" data-testid="uncaptured">
                  {l}
                </li>
              ))}
            </ul>
            {evidenceDetails}
          </Card>

          <RelevantHistory memory={memory} />

          {unmapped.length ? (
            <ScopeConfirmationCard
              phrases={unmapped.map((u) => ({ rawText: u.rawText, evidenceQuote: u.evidenceQuote }))}
             
              form={<ConfirmServicesForm packages={packages.map((p) => ({ id: p.id, name: p.name }))} onDone={stageHref(dealId, "offer")} />}
            />
          ) : null}

          {questions.length ? (
            <Card className="p-5" data-testid="questions-card">
              <h2 className="text-[16px] font-semibold text-ink">{questions.length === 1 ? "A question for the buyer" : "Questions for the buyer"}</h2>
              {questions.some((x) => !x.draft?.sentAt) ? <p className="mt-1 text-[13px] text-muted">Not sent yet. Nothing reaches the buyer until you send.</p> : null}
              <ol className="mt-3 space-y-3">
                {questions.map(({ q, draft, reply }, qi) => (
                  <li key={q.id} className="rounded-xl border border-line p-3" data-testid={`question-${q.id}`}>
                    <p className="text-[15px] font-medium text-ink">
                      {q.question} <InfoButton label="Why this question matters" testId={`why-${q.id}`}>{q.whyItMatters}</InfoButton>
                    </p>
                    {reply ? (
                      <div className="mt-2 text-[13px] text-ink-2">
                        Buyer replied: <span className="font-medium text-ink">“{reply.text}”</span>
                        {!reply.refs.answerValue && primary?.id === "interpret_reply" ? <InterpretForm messageId={reply.id} buyerText={reply.text} options={INTERPRET_OPTIONS[q.id] ?? []} primary={qi === questions.findIndex((x) => x.reply && !x.reply.refs.answerValue)} /> : null}
                      </div>
                    ) : draft?.sentAt ? (
                      <p className="mt-2 text-[13px] text-muted">Waiting for the buyer.</p>
                    ) : null}
                  </li>
                ))}
              </ol>
              <div className="mt-4">
                {primary?.id === "send_questions" ? <PrimaryActionButton body={{ action: "send_questions" }}>{primary.label}</PrimaryActionButton> : null}
                {primary?.id === "use_answers" ? <PrimaryActionButton body={{ action: "adopt_replies" }} onDone={stageHref(dealId, "offer")}>{primary.label}</PrimaryActionButton> : null}
                {progress.kind === "waiting_on_buyer" ? <p className="text-[13px] font-medium text-ink-2" data-testid="waiting">Waiting for the buyer.</p> : null}
              </div>
            </Card>
          ) : null}
        </div>
        <ConversationThread s={s} scope="understand" buyerName={activeCase.buyer.name} opening={r.inputs.messages} showDrafts={questions.length === 0} />
      </div>
    </StageShell>
  );
}
