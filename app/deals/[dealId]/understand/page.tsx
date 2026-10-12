import Link from "next/link";
import { ConversationThread } from "@/components/conversation-thread";
import { ConfirmServicesForm, InterpretForm, PrimaryActionButton } from "@/components/client";
import { ClarificationDrafts } from "@/components/understand/clarification-drafts";
import { AnswerChip } from "@/components/understand/answer-chip";
import { AutoRefresh } from "@/components/understand/auto-refresh";
import { ConstraintList, type ConstraintItem, type ConstraintSlot } from "@/components/understand/constraint-list";
import { StageShell } from "@/components/deal/stage-shell";
import { ConfirmedServices, ScopeConfirmationCard } from "@/components/understand/scope-confirmation";
import { Card } from "@/components/ui";
import { understandSummary } from "@/lib/stage-summary";
import { loadDeal, stageHref } from "@/lib/deal-page";
import { originalProposalOf } from "@/lib/deal-context";
import { blockingLines, constraintRows, uncapturedLines } from "@/lib/understand-copy";
import { clarificationDraftLabel, taskOrRunProvenance } from "@/lib/model-provenance";
import { decisionAnswers, latestClarificationForQuestion, unmappedScopeOf } from "@/lib/service";
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
  // A deal the merchant has not yet read: nothing needs asking, but they should see what the buyer said before the offer.
  const firstLook = !current && !s.understandReviewed && s.selectedOption === null && s.agreements.length === 0 && ["offer.review", "offer.no_feasible", "offer.outside_templates"].includes(progress.rule);
  const r = s.run.record;
  const lines = blockingLines(out.profile, originalProposalOf(baseline));
  const uncaptured = uncapturedLines(out.evaluation);
  const unmapped = unmappedScopeOf(s, out);
  const scope = s.decisionBranch?.scope ?? null;
  const packages = activeCase.deal.packages;
  const confirmedServices = scope ? <ConfirmedServices names={scope.packageIds.map((id) => packages.find((p) => p.id === id)?.name ?? id)} phrases={scope.sources.map((x) => x.rawText)} /> : null;
  const answers = decisionAnswers(s);
  const primary = current ? progress.primaryAction : null;
  const memory = commercialMemoryForDeal({ merchantId: activeCase.deal.merchant.id, buyerId: activeCase.buyer.id, asOf: "2026-10-08", serviceIds: packages.map((item) => item.id) }, await loadKnowledgeSources());

  const questions = r.displayed.questions.map((q) => {
    const draft = latestClarificationForQuestion(s, q.id);
    const reply = draft ? ([...s.conversation].reverse().find((i) => i.inReplyTo === draft.id) ?? null) : null;
    const answer = answers.find((a) => a.questionId === q.id) ?? null;
    return { q, draft, reply, answer };
  });

  if (!current && !firstLook) {
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
            <div className="mt-4">
              <ConversationThread s={s} scope="understand" buyerName={activeCase.buyer.name} opening={r.inputs.messages} showDrafts={questions.length === 0} />
            </div>
          </details>
        </Card>
      </StageShell>
    );
  }

  const names = Object.fromEntries(packages.map((p) => [p.id, p.name]));
  const byQuestion = Object.fromEntries(questions.map((x) => [x.q.id, x]));
  // What is still unknown is an empty slot beside its fact. It fills when the buyer's reply is read.
  const ANSWER_TEXT: Record<string, Record<string, string>> = {
    "clar-gst": { yes: "Includes GST", no: "Excludes GST" },
    "clar-approval": { per_contract: "Whole deal", per_payment: "Per payment" },
  };
  const slotFor = (questionId: string, label: string): ConstraintSlot | null => {
    const x = byQuestion[questionId];
    if (!x) return null;
    const value = x.answer?.value ?? x.reply?.refs.answerValue ?? null;
    if (value && ANSWER_TEXT[questionId]?.[value]) return { state: "filled", label, filled: ANSWER_TEXT[questionId]![value]!, target: x.reply ? `thread-${x.reply.id}` : null };
    if (x.reply) return { state: "reading", label, target: `thread-${x.reply.id}` };
    if (x.draft?.sentAt) return { state: "asked", label, target: `thread-${x.draft.id}` };
    return { state: "empty", label, target: "clarification-drafts" };
  };
  const rows = constraintRows(out.profile, originalProposalOf(baseline), names);
  // Services the buyer asked for without naming them still get a row, so the question about them has a place.
  if (unmapped.length && !rows.some((row) => row.id === "needs")) rows.push({ id: "needs", label: "Needs", value: unmapped.map((u) => `“${u.rawText}”`).join(", "), note: null, evidence: [] });
  const items: ConstraintItem[] = rows.map((row) => ({
    ...row,
    slot: row.id === "budget" ? slotFor("clar-gst", "GST included?") : row.id === "approval" ? slotFor("clar-approval", "Per payment or whole deal?") : row.id === "needs" && unmapped.length ? { state: "action", label: "Which services?", target: "scope-confirmation" } : null,
  }));

  // What the code read from each clear reply sits under that reply. The answer can be changed until an offer is chosen.
  const canChange = s.agreements.length === 0 && s.selectedOption === null;
  const annotations = Object.fromEntries(
    questions
      .filter((x) => x.reply && (x.answer?.value ?? x.reply.refs.answerValue) && ANSWER_TEXT[x.q.id]?.[x.answer?.value ?? x.reply.refs.answerValue!])
      .map((x) => {
        const value = (x.answer?.value ?? x.reply!.refs.answerValue)!;
        const others = Object.entries(ANSWER_TEXT[x.q.id]!).filter(([v]) => v !== value).map(([v, label]) => ({ value: v, label }));
        return [x.reply!.id, <AnswerChip key={x.q.id} questionId={x.q.id} label={ANSWER_TEXT[x.q.id]![value]!} others={canChange && s.status !== "clarifying" ? others : null} />];
      }),
  );
  const unsent = questions.filter((x) => x.draft && !x.draft.sentAt);
  const provenance = taskOrRunProvenance(r, "clarify", s.run.viewing);
  const wordingLabel = [...new Set(unsent.map((x) => clarificationDraftLabel(x.draft!.state, provenance)))].join(" · ") || null;
  const interpret = primary?.id === "interpret_reply"
    ? questions.filter((x) => x.reply && !x.reply.refs.answerValue).map(({ q, reply }, index) => (
        <div key={q.id} className="rounded-xl border border-line bg-white p-2.5 text-[13px] text-ink-2" data-testid={`question-${q.id}`}>
          Their reply to “{q.question}”: <span className="font-medium text-ink">“{reply!.text}”</span>
          <InterpretForm messageId={reply!.id} buyerText={reply!.text} options={INTERPRET_OPTIONS[q.id] ?? []} primary={index === 0} />
        </div>
      ))
    : null;

  return (
    <StageShell dealId={dealId} viewing="understand">
      {progress.kind === "waiting_on_buyer" ? <AutoRefresh /> : null}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-5">
          <Card className="p-5" data-testid="blocking-card" data-walkthrough="constraint-evidence">
            <h2 className="text-[16px] font-semibold text-ink">What&apos;s in the way</h2>
            <ConstraintList items={items} />
            {uncaptured.length ? (
              <ul className="mt-2 space-y-1 text-[13px] text-ink-2">
                {uncaptured.map((l) => (
                  <li key={l} data-testid="uncaptured">{l}</li>
                ))}
              </ul>
            ) : null}
            {firstLook && !questions.length ? (
              <div className="mt-4">
                <PrimaryActionButton body={{ action: "understand_reviewed" }} onDone={stageHref(dealId, "offer")}>
                  {progress.rule === "offer.no_feasible" ? "See why nothing fits" : "See the offer"}
                </PrimaryActionButton>
              </div>
            ) : null}
          </Card>

          <RelevantHistory memory={memory} />

          {unmapped.length ? (
            <div id="scope-confirmation" tabIndex={-1}>
              <ScopeConfirmationCard
                phrases={unmapped.map((u) => ({ rawText: u.rawText, evidenceQuote: u.evidenceQuote }))}
                form={<ConfirmServicesForm packages={packages.map((p) => ({ id: p.id, name: p.name }))} onDone={stageHref(dealId, "offer")} />}
              />
            </div>
          ) : null}
        </div>
        <ConversationThread
          s={s}
          scope="understand"
          buyerName={activeCase.buyer.name}
          opening={r.inputs.messages}
          showDrafts={questions.length === 0}
          annotations={annotations}
          footer={
            questions.length ? (
              <ClarificationDrafts
                drafts={unsent.map((x) => ({ questionId: x.q.id, text: x.draft!.text, why: x.q.whyItMatters }))}
                wordingLabel={wordingLabel}
                sendLabel={primary?.id === "send_questions" ? primary.label : null}
                next={primary?.id === "use_answers" ? { label: primary.label, action: "adopt_replies", onDone: stageHref(dealId, "offer") } : firstLook ? { label: progress.rule === "offer.no_feasible" ? "See why nothing fits" : "Review offer", action: "understand_reviewed", onDone: stageHref(dealId, "offer") } : null}
                interpret={interpret}
              />
            ) : null
          }
        />
      </div>
    </StageShell>
  );
}
