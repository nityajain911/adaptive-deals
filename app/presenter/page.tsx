import { readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { connection } from "next/server";
import { PROMPTS, promptHash } from "@/ai/prompts";
import { ActionButton } from "@/components/client";
import { fmtTime } from "@/components/evidence";
import { AuditSections } from "@/components/audit/sections";
import { OtherOutcomes } from "@/components/presenter/other-outcomes";
import { CommercialMemoryProof } from "@/components/presenter/commercial-memory-proof";
import { PresenterTabs } from "@/components/presenter/presenter-tabs";
import { ScenarioCards } from "@/components/presenter/scenario-cards";
import { SituationButtons } from "@/components/presenter/situation-buttons";
import { Badge, Card, CardHeader } from "@/components/ui";
import { readPresenterFlags } from "@/lib/presenter-store";
import { currentOutcome, getState } from "@/lib/service";
import { dealContextFor, pinnedEconomicsOf } from "@/lib/deal-context";
import { liveProviderDiagnostics } from "@/lib/page-data";
import { loadKnowledgeSources } from "@/lib/knowledge";
import { loadReadings, readingLabel } from "@/commercial-memory/upload/ai-reader";
import { JsonBlock } from "@/components/json-block";
import { CopyButton } from "@/components/copy-button";
import { ReproducedBadge } from "@/components/audit/sections";
import { checkReproduced } from "@/lib/reproducibility";

export const metadata = { title: "Presenter · Adaptive Deals prototype" };

/**
 * Presenter page (spec §8.2). Material for preparing the demo and answering questions; not part of
 * the merchant product and not linked from it. The 90-second journey never needs this page.
 */
export default async function PresenterPage() {
  await connection();
  const s = await getState();
  const deal = dealContextFor(s, await pinnedEconomicsOf(s));
  const flags = await readPresenterFlags();
  const live = liveProviderDiagnostics();
  const documentReadings = Object.entries(await loadReadings(await loadKnowledgeSources()));
  const outcome = await currentOutcome(s).catch(() => null);
  const reproduced = await checkReproduced(s);
  let frozen: { promptHashes: Record<string, string> } = { promptHashes: {} };
  try { frozen = JSON.parse(readFileSync(path.join(process.cwd(), "evaluation/datasets/frozen/FREEZE.json"), "utf8")) as { promptHashes: Record<string, string> }; } catch { /* the table below then says the frozen record is unavailable */ }
  const hashes = Object.entries(PROMPTS).map(([k, p]) => [k, p.version, promptHash(p), frozen.promptHashes[k]] as const);
  const r = s.run.record;

  return (
    <main id="main" className="mx-auto w-full max-w-[1100px] flex-1 space-y-5 px-4 py-6" data-testid="presenter">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-bold text-ink">Presenter · not part of the merchant product</h1>
        <Link href="/deals/hero" className="ml-auto text-[13px] font-semibold text-blue hover:underline">
          Open merchant view →
        </Link>
      </div>

      <PresenterTabs controls={<div className="space-y-5">
      <Card>
        <CardHeader title="Open a buyer situation" meta={<span>Each replays its own recorded model run. If anything fails mid-demo, start here.</span>} />
        <div className="p-5"><SituationButtons /></div>
      </Card>

      <Card>
        <CardHeader title="Ask the rate card · judge Q&A" meta={<span>Exact quotes with sources, and an honest “insufficient evidence”. Private to the merchant.</span>} />
        <CommercialMemoryProof liveAvailable={live.available} />
      </Card>

      <Card>
        <CardHeader title="Runs" meta={<span>Run live makes a new external model call and always creates a new run ID; it never overwrites a pinned or committed run or any frozen result.</span>} />
        <div className="flex flex-wrap items-center gap-2 p-5">
          <p className="w-full text-[13px] text-ink-2" data-testid="presenter-provider">
            Configured live provider: {live.providerName} · {live.model} · credential {live.available ? "available" : "unavailable"}
          </p>
          {!live.available ? <p className="w-full rounded-lg border border-line bg-surface-muted px-3 py-2 text-[13px] text-ink-2" data-testid="presenter-using-cached">Using recorded runs. No live model is set up here, so every answer in the demo replays a saved run and no model is called.</p> : null}
          <ActionButton body={{ action: "run_live" }} testId="presenter-run-live" disabled={!live.available}>
            Run live (new external model call)
          </ActionButton>

        </div>
      </Card>

      <Card>
        <CardHeader title="Scenarios" meta={<span>Pick a situation. Every control is labelled and simulated; the guided demo pays the first phase in one go, then holds the month-three review.</span>} />
        <div className="space-y-4 p-5 text-[13px]">
          <ScenarioCards />
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
            <span className="font-semibold text-ink">Fail next send</span>
            <Badge tone={flags.failNextSend ? "amber" : "neutral"}>{flags.failNextSend ? "Armed (one-shot)" : "Off"}</Badge>
            <ActionButton body={{ action: "presenter_fail_next_send", on: !flags.failNextSend }} variant="secondary" testId="presenter-fail-next-send">
              {flags.failNextSend ? "Reset" : "Arm for the next initial proposal"}
            </ActionButton>
            <span className="w-full text-[12px] text-muted">Deterministic and one-shot. Applies only to the next initial proposal delivery, never to amendments. Stored outside the deal.</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
            <span className="font-semibold text-ink">Pause suggested question drafts</span>
            <Badge tone={s.suggestionsPaused ? "amber" : "neutral"}>{s.suggestionsPaused ? "Paused" : "Active"}</Badge>
            <ActionButton body={{ action: "presenter_pause_ai", paused: !s.suggestionsPaused }} variant="secondary">
              {s.suggestionsPaused ? "Resume" : "Pause"}
            </ActionButton>
            <span className="w-full text-[12px] text-muted">While paused, no new suggested question drafts are created. Existing drafts remain unchanged, and buyer messages are still recorded.</span>
          </div>
        </div>
      </Card>

      <OtherOutcomes scenario={s.scenario} />

      </div>} evidence={<div className="space-y-5">
      <Card>
        <CardHeader title="Run record and integrity" />
        <div className="space-y-3 p-5 text-[13px]">
          <div>
            Run <CopyButton value={r.runId} label="run id" text /> · {r.kind} · model {r.model}
          </div>
          <ul className="space-y-0.5 text-ink-2">
            {r.steps.map((st) => (
              <li key={st.inputHash}>
                {st.task} · {st.promptVersion} · {st.provider} · {st.outcome.replace(/_/g, " ")}
              </li>
            ))}
          </ul>
          <p className="flex flex-wrap items-center gap-2" data-testid="presenter-integrity"><ReproducedBadge result={reproduced} /> <span>{reproduced.ok ? "The stored run replays to exactly the same engine result and displayed text, with no model call." : "The stored run could not be reproduced."}</span></p>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-muted">
                <th>Prompt</th>
                <th>Version</th>
                <th>Matches FREEZE.json</th>
              </tr>
            </thead>
            <tbody>
              {hashes.map(([k, v, h, f]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{v}</td>
                  <td>{f === undefined ? <span className="rounded-full bg-surface-muted px-2 py-0.5 font-medium text-ink-2">Not in the frozen evaluation</span> : h === f ? <span className="rounded-full bg-green-weak px-2 py-0.5 font-semibold text-green" data-testid={`freeze-match-${k}`}>✓ Matches</span> : <span className="rounded-full bg-red-weak px-2 py-0.5 font-semibold text-red" data-testid={`freeze-match-${k}`}>Differs</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="AI readings behind the merchant's screens" meta={<span>Which model answered, and what was tried first. The merchant sees none of this.</span>} />
        <div className="space-y-2 p-5 text-[12px]" data-testid="presenter-ai-readings">
          {documentReadings.length ? (
            <ul className="space-y-1">
              {documentReadings.map(([id, reading]) => (
                <li key={id} data-testid={`presenter-reading-${id}`}>
                  Rate card or cost sheet <code>{id}</code> · {readingLabel(reading)}{reading.attempts?.length ? ` · tried ${reading.attempts.map((a) => `${a.provider}: ${a.outcome}`).join(", ")}` : ""}
                </li>
              ))}
            </ul>
          ) : <p className="text-muted">No document has been read by a model in this session.</p>}
          {(s.replySuggestions ?? []).length ? (
            <ul className="space-y-1">
              {(s.replySuggestions ?? []).map((x) => (
                <li key={x.messageId} data-testid={`presenter-suggestion-${x.messageId}`}>
                  Reply {x.messageId} · “{x.phrase}” → unavailable through {x.unavailableUntil} · {x.provider} / {x.model} · tried {x.attempts.map((a) => `${a.provider}: ${a.outcome}`).join(", ")} · {x.state}
                </li>
              ))}
            </ul>
          ) : <p className="text-muted">No payment reply has needed a model reading in this session.</p>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Merchant audit (read-only, as the merchant sees it)" />
        <div className="p-5">
          {outcome ? <AuditSections s={s} out={outcome} deal={deal} reproduced={reproduced} /> : <p className="text-[13px] text-red">Unavailable: the stored run could not be replayed.</p>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Event log" meta={<span>Newest first · every simulated action is labelled</span>} />
        <ol className="max-h-[420px] divide-y divide-line overflow-y-auto" tabIndex={0} aria-label="Events, newest first" data-testid="presenter-events">
          {[...s.events].reverse().map((e) => (
            <li key={e.id} className="px-5 py-2 text-[12px]">
              <span className="font-medium text-ink">{e.title}</span> <span className="text-muted">· {e.provenance} · {fmtTime(e.at)}</span>
              {e.detail ? <div className="text-muted">{e.detail}</div> : null}
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <CardHeader title="Raw records" meta={<span>Outcomes, deliveries, handled messages and interpretations, as stored</span>} />
        <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2">
          <JsonBlock title="Outcome records" value={s.outcomes} />
          <JsonBlock title="Deliveries" value={s.deliveries} />
          <JsonBlock title="Handled messages" value={s.handledMessages} />
          <JsonBlock title="Merchant interpretations" value={s.interpretations} />
        </div>
      </Card>
      </div>} />
    </main>
  );
}
