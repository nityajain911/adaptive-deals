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
import { caseAuthoredOutputs, CASE_SYNTHETIC_RUN_IDS } from "@/data/synthetic/case-ai-outputs";
import { allDemoCases } from "@/data/synthetic/cases";

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

  for (const item of allDemoCases()) {
    const caseProvider = new SyntheticAuthoredProvider(caseAuthoredOutputs[item.id], item.deal.messages.map((message) => message.text));
    const firstCase = await runConstruct({
      provider: caseProvider,
      kind: "synthetic_replay",
      runId: CASE_SYNTHETIC_RUN_IDS[item.id],
      clock: new FixedClock(),
      deal: item.deal,
    });
    const finalCase = item.expected.recordedAnswers.length
      ? await runConstruct({
          provider: caseProvider,
          kind: "synthetic_replay",
          runId: CASE_SYNTHETIC_RUN_IDS[item.id],
          clock: new FixedClock(),
          deal: item.deal,
          answers: item.expected.recordedAnswers,
          previous: firstCase.record,
        })
      : firstCase;
    if (finalCase.evaluation.state !== item.expected.engineState) {
      throw new Error(`${item.id} expected ${item.expected.engineState}, got ${finalCase.evaluation.state}`);
    }
    const caseOut = path.join(process.cwd(), item.bundledRunPath);
    mkdirSync(path.dirname(caseOut), { recursive: true });
    writeFileSync(caseOut, JSON.stringify(finalCase.record, null, 2) + "\n");
    console.log(`Wrote ${caseOut} · ${finalCase.record.steps.length} steps · final state ${finalCase.evaluation.state}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
