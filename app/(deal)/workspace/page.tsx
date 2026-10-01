import Link from "next/link";
import { formatDate, formatDateValue } from "@/domain/dates";
import { shortReason } from "@/domain/copy";
import { Conversation, Quote } from "@/components/evidence";
import { ActionButton } from "@/components/client";
import { Badge, Card, CardHeader, Empty, Label, Notice, Pill } from "@/components/ui";
import { SCENARIOS } from "@/data/synthetic/scenarios";
import { loadPage } from "@/lib/page-data";
import type { FieldCard } from "@/ai/run-record";

const STATUS: Record<string, ["green" | "amber" | "neutral", string]> = { stated: ["green", "Stated"], ambiguous: ["amber", "Ambiguous"], missing: ["neutral", "Not stated"] };
const STATE_COPY: Record<string, [string, "amber" | "red" | "blue" | "green"]> = {
  ambiguous: ["Ambiguous — clarification needed", "amber"],
  insufficient_information: ["Insufficient information", "amber"],
  outside_templates: ["Outside supported templates", "red"],
  no_feasible_deal: ["No feasible deal", "red"],
  options_ready: ["Options ready", "blue"],
};

function ConstraintCard({ f, messages }: { f: FieldCard; messages: Parameters<typeof Quote>[0]["messages"] }) {
  const [tone, label] = STATUS[f.status] ?? ["neutral", f.status];
  return (
    <article className="rounded-xl border border-line bg-surface p-4" data-testid={`constraint-${f.key}`} aria-label={f.label}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-ink">{f.label}</h3>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <div className="mt-1 text-[15px] font-semibold text-ink tabular">{f.display ?? (f.status === "ambiguous" ? "Needs confirmation" : "—")}</div>
      {f.rawText ? <div className="mt-1 text-[12px] text-muted">Raw text: “{f.rawText}”</div> : null}
      {f.evidence.map((e, i) => (
        <Quote key={i} e={e} messages={messages} />
      ))}
      {f.transformation ? <div className="mt-2 text-[12px] text-muted">Code: {f.transformation}</div> : null}
      {f.note ? <div className="mt-2 text-[12px] text-amber">{f.note}</div> : null}
      {f.confirmedBy ? (
        <div className="mt-2 text-[12px] text-green">
          Confirmed by buyer via {f.confirmedBy.via} · {f.confirmedBy.questionId}
        </div>
      ) : null}
      <div className="mt-2 text-[11px] text-muted">Confidence (review priority only): {f.confidence}</div>
    </article>
  );
}

export default async function WorkspacePage() {
  const { s, out } = await loadPage();
  const r = s.run.record;
  const messages = [...r.inputs.messages, ...s.extraMessages];
  const cards = r.engine.profile.filter((f) => f.status !== "missing" || ["budgetNow", "nextBudget", "approvalLimit"].includes(f.key));
  const evidence = r.engine.profile.flatMap((f) => f.evidence.map((e) => ({ ...e, label: f.label })));
  const gap = r.engine.derivedBudgetGap;
  const initial = r.engine.initial;
  const [stateLabel, stateTone] = STATE_COPY[initial.state];
  const scenario = s.scenario;
  const scenarioDef = SCENARIOS.find((x) => x.id === scenario?.id);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Card aria-labelledby="conv">
        <CardHeader id="conv" title="Buyer conversation" meta={<><Label kind="synthetic" /><span>Pasted from WhatsApp; treated as untrusted data</span></>} />
        <div className="p-5">
          <Conversation messages={messages} evidence={evidence} />
          {r.engine.suspectedInstructions.length ? (
            <div className="mt-4">
              <Notice tone="red" title="Embedded instructions ignored">
                {r.engine.suspectedInstructions.map((q, i) => (
                  <div key={i}>“{q.quote}” ({q.messageId}) — recorded for review; it cannot change instructions or seller policy.</div>
                ))}
              </Notice>
            </div>
          ) : null}
        </div>
      </Card>

      <div className="space-y-5">
        <Card aria-labelledby="profile">
          <CardHeader
            id="profile"
            title="Constraint profile"
            meta={
              <>
                <Badge tone={stateTone}>Engine state: {stateLabel}</Badge>
                <span>AI cites the evidence; code verifies quotes and normalises every value</span>
              </>
            }
          />
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {cards.map((f) => (
              <ConstraintCard key={f.key} f={f} messages={messages} />
            ))}
            {gap ? (
              <article className="rounded-xl border border-[#f7dfb4] bg-amber-weak p-4 sm:col-span-2" data-testid="budget-gap" aria-label="Derived budget gap">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[13px] font-semibold text-ink">Derived budget gap</h3>
                  <Label kind="engine" />
                </div>
                <div className="mt-1 text-[15px] font-semibold text-ink">
                  No additional budget from {formatDate(gap.from)} until {formatDateValue(gap.until)} ({gap.until.precision} precision)
                </div>
                <div className="mt-1 text-[12px] text-ink-2">{gap.rule}.</div>
                {gap.evidence.map((e, i) => (
                  <Quote key={i} e={e} messages={messages} />
                ))}
              </article>
            ) : null}
          </div>
          {r.engine.rejectedFields.length ? (
            <div className="px-5 pb-5">
              <Notice tone="red" title="Fields rejected by code">
                {r.engine.rejectedFields.map((x, i) => (
                  <div key={i}>
                    {x.key}: {x.reason}
                  </div>
                ))}
              </Notice>
            </div>
          ) : null}
        </Card>

        <Card aria-labelledby="amb">
          <CardHeader id="amb" title="Ambiguity status" meta={<span>Code evaluated every reading across all {out.evaluation.result?.templatesEvaluated.length ?? 4} templates</span>} />
          <div className="space-y-2 p-5">
            {initial.ambiguities.length === 0 ? <Empty>No ambiguities.</Empty> : null}
            {initial.ambiguities.map((a) => (
              <div key={a.field} className="flex flex-wrap items-center gap-2 text-[13px]" data-testid={`ambiguity-${a.field}`}>
                <Badge tone={a.decisionRelevant ? "amber" : "neutral"}>{a.decisionRelevant ? "Changes the decision" : "Does not change the decision"}</Badge>
                <span className="font-semibold text-ink">{a.field === "amountsIncludeGst" ? "Do both amounts include GST?" : a.field === "approvalScope" ? "Is the approval limit per payment or per contract?" : "Which next-budget month?"}</span>
                <span className="text-muted">{a.differingStructures.length} option(s) change outcome</span>
              </div>
            ))}
            {s.status === "clarifying" ? (
              <div className="pt-2">
                <Link href="/clarification" className="text-[13px] font-semibold text-blue hover:underline">
                  Go to clarification →
                </Link>
              </div>
            ) : null}
          </div>
        </Card>

        <Card aria-labelledby="run">
          <CardHeader id="run" title="Run record" meta={<><Pill>{r.runId}</Pill><Label kind={r.kind === "live" ? (s.run.viewing === "replay" ? "replay_actual" : "live") : "synthetic_replay"} /></>} />
          <div className="p-5">
            <ul className="space-y-1 text-[12px] text-ink-2">
              {r.steps.map((st) => (
                <li key={st.inputHash} className="flex flex-wrap gap-2">
                  <span className="font-semibold text-ink">{st.task}</span>
                  <span>{st.promptVersion}</span>
                  <span>· {st.provider} · {st.model}</span>
                  <span>· temperature: {st.temperature}</span>
                  <Badge tone={st.outcome === "accepted" ? "green" : st.outcome === "failed" || st.outcome === "rejected" ? "red" : "amber"}>{st.outcome.replace(/_/g, " ")}</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-muted">Every run stores inputs, prompt versions and hashes, raw AI output, the engine result and what was displayed. Replays are refused unless they reproduce the stored run exactly.</p>
          </div>
        </Card>

        <Card aria-labelledby="scen">
          <CardHeader id="scen" title="Try another conversation" meta={<><Label kind="synthetic_replay" /><span>All four failure states, computed by the engine</span></>} />
          <div className="p-5">
            <div className="flex flex-wrap gap-2">
              {SCENARIOS.map((sc) => (
                <ActionButton key={sc.id} body={{ action: "run_scenario", scenarioId: sc.id }} variant={scenario?.id === sc.id ? "primary" : "secondary"} testId={sc.id}>
                  {sc.title}
                </ActionButton>
              ))}
              {scenario ? (
                <ActionButton body={{ action: "run_scenario", scenarioId: null }} variant="ghost">
                  Clear
                </ActionButton>
              ) : null}
            </div>
            <p className="mt-2 text-[12px] text-muted">The hero conversation above shows the fourth state, Ambiguous.</p>
            {scenario && scenarioDef ? (
              <div className="mt-4 space-y-3" data-testid="scenario-result">
                <Conversation messages={scenario.record.inputs.messages} evidence={scenario.record.engine.profile.flatMap((f) => f.evidence.map((e) => ({ ...e, label: f.label })))} />
                <Notice tone={STATE_COPY[scenario.record.engine.initial.state][1] === "red" ? "red" : "amber"} title={`Engine state: ${STATE_COPY[scenario.record.engine.initial.state][0]}`}>
                  <ScenarioExplanation record={scenario.record} />
                </Notice>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ScenarioExplanation({ record }: { record: import("@/ai/run-record").RunRecord }) {
  const e = record.engine.initial;
  if (e.state === "insufficient_information") return <>Required information is missing: {e.missingRequired.join(", ") || "a decidable payment date"}. Ask the buyer for it before structuring a deal.</>;
  if (e.state === "outside_templates")
    return (
      <>
        {e.outsideTemplates.map((o) => o.reason).join(" ")} Supported structures are split payment, phased scope, deferred start and shorter commitment.
      </>
    );
  if (e.state === "no_feasible_deal")
    return (
      <>
        All {e.structures.length} structures across {e.templatesEvaluated.length} templates were evaluated; none passes. Blocking reasons:{" "}
        {[...new Set(e.structures.flatMap((x) => x.failingCodes))].map(shortReason).join("; ")}.
      </>
    );
  return <>Decision-relevant facts are unresolved.</>;
}
