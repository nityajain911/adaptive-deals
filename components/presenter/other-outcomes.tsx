import { shortReason } from "@/domain/copy";
import type { RunRecord } from "@/ai/run-record";
import { SCENARIOS } from "@/data/synthetic/scenarios";
import { ActionButton } from "../client";
import { Badge, Card, CardHeader, Label, Notice, Pill } from "../ui";

/** Code-drafted question for each missing required fact (no AI; fixed wording). */
const MISSING_QUESTION: Record<string, string> = {
  budgetNow: "How much budget do you have available now, and until when? Please also say whether the amount includes GST.",
};

const OUTCOMES = [
  { state: "insufficient_information", scenarioId: "scenario-insufficient", title: "Missing information", action: "Draft the specific missing question" },
  { state: "ambiguous", scenarioId: null, title: "Ambiguous", action: "Draft the decision-relevant confirmation" },
  { state: "outside_templates", scenarioId: "scenario-outside", title: "Outside supported templates", action: "Hand over to the merchant" },
  { state: "no_feasible_deal", scenarioId: "scenario-no-feasible", title: "No feasible structure", action: "Explain the binding checks; close or reconsider inputs" },
] as const;

/**
 * Other engine outcomes, subordinate to the hero deal. Each example is a synthetic replay through
 * the real engine; the next action is bounded and nothing is sent from here.
 */
export function OtherOutcomes({ scenario }: { scenario: { id: string; record: RunRecord } | null }) {
  const def = SCENARIOS.find((x) => x.id === scenario?.id);
  const e = scenario?.record.engine.initial;
  return (
    <Card aria-labelledby="other-outcomes" data-testid="other-outcomes">
      <CardHeader id="other-outcomes" title="Other outcomes" meta={<><Label kind="synthetic_replay" /><span>Computed by the engine · each has one bounded next action</span></>} />
      <div className="space-y-4 p-5">
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {OUTCOMES.map((o) => {
            const sc = SCENARIOS.find((x) => x.id === o.scenarioId);
            const selected = !!sc && sc.id === scenario?.id;
            return (
              <li key={o.state} className="rounded-xl border border-line p-3">
                <div className="text-[13px] font-semibold text-ink">{o.title}</div>
                <div className="mt-0.5 text-[12px] text-muted">Next action: {o.action}</div>
                <div className="mt-2">
                  {o.state === "ambiguous" ? (
                    <span className="text-[12px] text-ink-2">The hero deal above. Its two drafted questions are in the buyer conversation.</span>
                  ) : sc ? (
                    <ActionButton body={{ action: "run_scenario", scenarioId: sc.id }} variant={selected ? "primary" : "secondary"} testId={sc.id}>
                      {selected ? "Showing example" : "Show example"}
                    </ActionButton>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        {scenario && def && e ? (
          <div className="space-y-3 rounded-xl border border-line bg-surface-muted p-4" data-testid="scenario-result">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
              <Badge tone="amber">Received from buyer</Badge>
              <Pill>Synthetic example</Pill>
            </div>
            <p className="text-[14px] leading-6 text-ink">“{scenario.record.inputs.messages[0].text}”</p>
            {e.state === "insufficient_information" ? (
              <Notice tone="amber" title="Engine state: Insufficient information">
                Required information is missing ({e.missingRequired.join(", ")}). No structure is built until it is known.
                <div className="mt-2 rounded-lg border border-line bg-surface px-3 py-2" data-testid="next-action">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Next action · question drafted by code (not sent)</div>
                  {e.missingRequired.map((k) => (
                    <p key={k} className="mt-1 text-[13px] text-ink">
                      {MISSING_QUESTION[k] ?? `Please confirm ${k}.`}
                    </p>
                  ))}
                </div>
              </Notice>
            ) : e.state === "outside_templates" ? (
              <Notice tone="red" title="Engine state: Outside supported templates">
                {e.outsideTemplates.map((o) => `“${o.rawText}” (${o.kind.replace(/_/g, " ")})`).join("; ")} cannot be represented by split payment, phased scope, deferred start or shorter commitment.
                <div className="mt-2 rounded-lg border border-line bg-surface px-3 py-2" data-testid="next-action">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Next action</div>
                  <p className="mt-1 text-[13px] text-ink">Hand over to the merchant. Adaptive Deals drafts no terms and sends nothing for this request.</p>
                </div>
              </Notice>
            ) : e.state === "no_feasible_deal" ? (
              <Notice tone="red" title="Engine state: No feasible deal">
                All {e.structures.length} structures across {e.templatesEvaluated.length} templates were evaluated; none passes.
                <div className="mt-2 rounded-lg border border-line bg-surface px-3 py-2" data-testid="next-action">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Next action · binding checks</div>
                  <ul className="mt-1 list-disc pl-5 text-[13px] text-ink">
                    {bindingChecks(e.structures).map(([code, n]) => (
                      <li key={code}>
                        {shortReason(code)} <span className="text-muted">({n} of {e.structures.length} structures)</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[13px] text-ink-2">Close the enquiry, or reconsider the inputs with the buyer (budget, start date). Adaptive Deals does not search for what would need to change.</p>
                  <div className="mt-2">
                    <ActionButton body={{ action: "run_scenario", scenarioId: null }} variant="secondary" testId="close-outcome">
                      Close this outcome
                    </ActionButton>
                  </div>
                </div>
              </Notice>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function bindingChecks(structures: { failingCodes: string[] }[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const s of structures) for (const c of new Set(s.failingCodes)) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
