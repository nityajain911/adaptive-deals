/**
 * npx tsx evaluation-assist/runner/narrative.ts --set dev                      (dry run)
 * npx tsx evaluation-assist/runner/narrative.ts --set dev --execute --run-name dev-r1 [--interval-ms 8000] [--limit 5]
 * --set holdout checks the hold-out manifest first.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ASSIST_PROMPTS, promptHash } from "@/assist/prompts";
import { NarrativeInputSchema } from "@/assist/narrative/schema";
import { runNarrative } from "@/assist/narrative/run";
import { executeEval } from "./execute";

const set = process.argv.includes("--set") ? process.argv[process.argv.indexOf("--set") + 1] : "dev";
const dir = set === "dev" ? path.join("evaluation-assist", "cases", "strategy_narrative", "dev") : path.join("evaluation-assist", "holdout-private", "strategy_narrative", "holdout");
const cases = readdirSync(dir).filter((f) => f.startsWith("ns-")).sort().map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as { id: string; adversarial?: boolean; input: unknown });
const prompt = ASSIST_PROMPTS.strategy_narrative;

executeEval({
  task: "strategy_narrative",
  prompt: { version: prompt.version, hash: promptHash(prompt) },
  estimateTokens: 1600,
  cases,
  call: (input, provider) => runNarrative(NarrativeInputSchema.parse(input), provider),
  summarise: (runs) => {
    const verdicts = runs.flatMap((r) => r.run.verdicts);
    const accepted = verdicts.filter((v) => v.accepted);
    const reasons: Record<string, number> = {};
    for (const v of verdicts) for (const reason of v.reasons) reasons[reason] = (reasons[reason] ?? 0) + 1;
    return {
      statuses: Object.fromEntries([...new Set(runs.map((r) => r.run.status))].map((s) => [s, runs.filter((r) => r.run.status === s).length])),
      offers: verdicts.length, acceptedSentences: accepted.length, N3_acceptanceRate: verdicts.length ? accepted.length / verdicts.length : null,
      rejectionReasons: reasons, N1_acceptedWithFigure: accepted.filter((v) => /[0-9₹%]/.test(v.sentence ?? "")).length,
    };
  },
}).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
