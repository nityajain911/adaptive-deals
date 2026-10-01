/**
 * Builds the bundled credential-free replay from hand-written synthetic AI outputs plus the
 * real engine. The result is labelled "Synthetic replay" — never "Replay of an actual run".
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FixedClock } from "@/domain/clock";
import { runConstruct } from "@/ai/orchestrator";
import { SyntheticAuthoredProvider } from "@/ai/synthetic-provider";
import { heroDeal, heroRecordedAnswers } from "@/data/synthetic/hero-run";
import { heroSyntheticClarificationOutput, heroSyntheticExplanationOutput, heroSyntheticExtractionOutput, SYNTHETIC_RUN_ID } from "@/data/synthetic/hero-ai-outputs";

const provider = new SyntheticAuthoredProvider(
  { extract: heroSyntheticExtractionOutput, clarify: heroSyntheticClarificationOutput, explain: heroSyntheticExplanationOutput },
  ['id="msg-2"', "Only ₹50K left this quarter"],
);

async function main() {
  const first = await runConstruct({ provider, kind: "synthetic_replay", runId: SYNTHETIC_RUN_ID, clock: new FixedClock(), deal: heroDeal() });
  const done = await runConstruct({ provider, kind: "synthetic_replay", runId: SYNTHETIC_RUN_ID, clock: new FixedClock(), deal: heroDeal(), answers: heroRecordedAnswers, previous: first.record });
  if (done.record.status !== "complete") throw new Error(`Synthetic run did not complete: ${done.record.status}`);
  const out = path.join(process.cwd(), "data/synthetic/replay/hero-synthetic-run.json");
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(done.record, null, 2) + "\n");
  console.log(`Wrote ${out} · ${done.record.steps.length} steps · final state ${done.record.engine.final?.state}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
