import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { connection } from "next/server";
import { liveAvailability } from "@/ai/config";
import { PROMPTS, promptHash } from "@/ai/prompts";
import { ActionButton } from "@/components/client";
import { fmtTime } from "@/components/evidence";
import { AuditSections } from "@/components/audit/sections";
import { OtherOutcomes } from "@/components/presenter/other-outcomes";
import { CommercialMemoryProof } from "@/components/presenter/commercial-memory-proof";
import { Badge, Card, CardHeader } from "@/components/ui";
import { readPresenterFlags } from "@/lib/presenter-store";
import { currentOutcome, getState } from "@/lib/service";
import { dealContextFor, pinnedEconomicsOf } from "@/lib/deal-context";

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
  const live = liveAvailability();
  const committed = readdirSync(path.join(process.cwd(), "data/live-runs")).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
  let integrity: string;
  const outcome = await currentOutcome(s).catch(() => null);
  try {
    if (!outcome) throw new Error("the stored run could not be replayed");
    integrity = "Replay reproduces the stored run exactly.";
  } catch (e) {
    integrity = `Replay integrity failed: ${(e as Error).message}`;
  }
  const frozen = JSON.parse(readFileSync(path.join(process.cwd(), "evaluation/datasets/frozen/FREEZE.json"), "utf8")) as { promptHashes: Record<string, string> };
  const hashes = Object.entries(PROMPTS).map(([k, p]) => [k, p.version, promptHash(p), frozen.promptHashes[k]] as const);
  const r = s.run.record;
  const json = (v: unknown) => <pre className="max-h-[320px] overflow-auto rounded-lg bg-surface-muted p-3 text-[12px] leading-4 text-ink-2">{JSON.stringify(v, null, 2)}</pre>;

  return (
    <main id="main" className="mx-auto w-full max-w-[1100px] flex-1 space-y-5 px-4 py-6" data-testid="presenter">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-bold text-ink">Presenter · not part of the merchant product</h1>
        <Link href="/deals/hero" className="ml-auto text-[13px] font-semibold text-blue hover:underline">
          Open merchant view →
        </Link>
      </div>

      <Card>
        <CardHeader title="Runs" meta={<span>Run live makes a new external model call and always creates a new run ID; it never overwrites a pinned or committed run or any frozen result.</span>} />
        <div className="flex flex-wrap items-center gap-2 p-5">
          <ActionButton body={{ action: "run_live" }} testId="presenter-run-live" disabled={!live.available}>
            Run live (new external model call)
          </ActionButton>
          {!live.available ? <span className="text-[12px] text-muted">Unavailable: {live.reason.split(";")[0]}.</span> : null}
          {committed.map((id) => (
            <ActionButton key={id} body={{ action: "replay_run", runId: id }} variant="ghost">
              Replay {id} (no model call)
            </ActionButton>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Commercial Memory proof" meta={<span>Test an unseen query, a truthful abstention and a blocked conflict. This evidence stays private to the merchant.</span>} />
        <CommercialMemoryProof liveAvailable={live.available} />
      </Card>

      <Card>
        <CardHeader title="Simulations" meta={<span>Every control is labelled and simulated. The guided demo follows the preventive path; the failed-debit path is a secondary scenario.</span>} />
        <div className="space-y-3 p-5 text-[13px]">
          <div className="flex flex-wrap gap-2">
            <ActionButton body={{ action: "simulate", event: "payment_link_paid" }} variant="sim">
              Simulate: upfront link paid
            </ActionButton>
            <ActionButton body={{ action: "simulate", event: "mandate_confirmed" }} variant="sim">
              Simulate: mandate confirmed
            </ActionButton>
            <ActionButton body={{ action: "simulate", event: "advance_notice" }} variant="sim">
              Simulate: send the scheduled notice (advances the date)
            </ActionButton>
            <ActionButton body={{ action: "simulate", event: "debit_succeeded" }} variant="sim">
              Simulate: next debit succeeds (on its due date)
            </ActionButton>
          </div>
          <div className="rounded-xl border border-line p-3" data-testid="presenter-failed-debit">
            <div className="font-semibold text-ink">Secondary scenario: restructure after a failed debit</div>
            <p className="mt-0.5 text-muted">Simulates the 1 Dec debit failing (an internal retry is scheduled), then the buyer&apos;s reply after the failure. The amendment is then recorded as after a failed debit, not preventive.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <ActionButton body={{ action: "simulate", event: "debit_failed" }} variant="sim" testId="presenter-debit-failed">
                Simulate failed debit on its due date
              </ActionButton>
              <ActionButton body={{ action: "simulate", event: "buyer_reply" }} variant="sim">
                Simulate: buyer replies after the failure
              </ActionButton>
            </div>
          </div>
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

      <Card>
        <CardHeader title="Run record and integrity" />
        <div className="space-y-3 p-5 text-[13px]">
          <div>
            Run <code className="font-mono">{r.runId}</code> · {r.kind} · model {r.model}
          </div>
          <ul className="space-y-0.5 text-ink-2">
            {r.steps.map((st) => (
              <li key={st.inputHash}>
                {st.task} · {st.promptVersion} · {st.provider} · {st.outcome.replace(/_/g, " ")}
              </li>
            ))}
          </ul>
          <p data-testid="presenter-integrity">{integrity}</p>
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
                  <td>{h === f ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Merchant audit (read-only, as the merchant sees it)" />
        <div className="p-5">
          {outcome ? <AuditSections s={s} out={outcome} deal={deal} /> : <p className="text-[13px] text-red">Unavailable: the stored run could not be replayed.</p>}
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
          <div>
            <div className="mb-1 text-[12px] font-semibold text-ink">Outcome records</div>
            {json(s.outcomes)}
          </div>
          <div>
            <div className="mb-1 text-[12px] font-semibold text-ink">Deliveries</div>
            {json(s.deliveries)}
          </div>
          <div>
            <div className="mb-1 text-[12px] font-semibold text-ink">Handled messages</div>
            {json(s.handledMessages)}
          </div>
          <div>
            <div className="mb-1 text-[12px] font-semibold text-ink">Merchant interpretations</div>
            {json(s.interpretations)}
          </div>
        </div>
      </Card>
    </main>
  );
}
