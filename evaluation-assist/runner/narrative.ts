/**
 * Runs `strategy_narrative.v1` over a case set. DRY RUN BY DEFAULT: it prints what it would do and makes no
 * call. A real run needs `--execute`, a `--run-name`, GROQ_API_KEY in the environment (never printed), and an
 * approval from the applicant to run. It counts every call against the approved budget and halts on the
 * stop rules in PLAN.md §5.
 *
 *   npx tsx evaluation-assist/runner/narrative.ts --set dev
 *   npx tsx evaluation-assist/runner/narrative.ts --set dev --execute --run-name dev-r1 [--interval-ms 8000] [--limit 5]
 *   npx tsx evaluation-assist/runner/narrative.ts --set holdout --execute --run-name final-r1   (checks the hold-out manifest first)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AssistGroq } from "@/assist/groq";
import { ASSIST_PROMPTS, promptHash } from "@/assist/prompts";
import { NarrativeInputSchema } from "@/assist/narrative/schema";
import { runNarrative, type NarrativeRun } from "@/assist/narrative/run";
import { haltReason, loadLedger, remaining, saveLedger, spend } from "./budget";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (name: string) => process.argv.includes(`--${name}`);
const SET = arg("set") ?? "dev";
const EXECUTE = flag("execute");
const RUN_NAME = arg("run-name");
const INTERVAL = Number(arg("interval-ms") ?? 8000);
const LIMIT = arg("limit") ? Number(arg("limit")) : Infinity;
const LEDGER = path.join("evaluation-assist", "results", "ledger.json");
const ESTIMATE_TOKENS = 1600;

function loadCases(set: string) {
  const dirs = set === "dev" ? [path.join("evaluation-assist", "cases", "strategy_narrative", "dev")] : [path.join("evaluation-assist", "holdout-private", "strategy_narrative", "holdout")];
  return dirs.flatMap((dir) => readdirSync(dir).filter((f) => f.startsWith("ns-")).sort().map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as { id: string; adversarial?: boolean; input: unknown }));
}

async function main() {
  const cases = loadCases(SET).slice(0, LIMIT);
  const ledger = loadLedger(LEDGER);
  const left = remaining(ledger, "strategy_narrative");
  console.log(`${EXECUTE ? "EXECUTE" : "DRY RUN"} · set=${SET} · cases=${cases.length} · prompt=${ASSIST_PROMPTS.strategy_narrative.version} (${promptHash(ASSIST_PROMPTS.strategy_narrative).slice(0, 12)}) · calls left for this task=${left} of cap ${ledger.total}/${581} used`);
  if (!EXECUTE) return console.log("No call made. Add --execute --run-name <name> after approval to run.");
  if (!RUN_NAME) throw new Error("--run-name is required with --execute");
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set");
  if (cases.length > left) throw new Error(`This run needs ${cases.length} calls but only ${left} remain in the budget`);
  if (SET !== "dev") execFileSync("npx", ["tsx", "evaluation-assist/generators/hash-holdout.ts", "check"], { stdio: "inherit" });

  const provider = new AssistGroq(process.env.ADAPTIVE_DEALS_MODEL?.trim() || "openai/gpt-oss-120b");
  const runs: { id: string; adversarial: boolean; ms: number; run: NarrativeRun }[] = [];
  let consecutive = 0, tokens = 0, halted: string | null = null;
  for (const c of cases) {
    spend(ledger, "strategy_narrative");
    saveLedger(LEDGER, ledger); // counted before the call, so a crash cannot hide a spent call
    const started = Date.now();
    const run = await runNarrative(NarrativeInputSchema.parse(c.input), provider);
    runs.push({ id: c.id, adversarial: !!c.adversarial, ms: Date.now() - started, run });
    consecutive = run.status === "not_configured" || run.status === "unavailable" ? consecutive + 1 : 0;
    tokens += (run.meta?.usage?.inputTokens ?? 0) + (run.meta?.usage?.outputTokens ?? 0);
    halted = haltReason({ calls: runs.length, consecutiveAuthOrQuota: consecutive, avgTokensPerCall: runs.length ? tokens / runs.length : null, estimatedTokensPerCall: ESTIMATE_TOKENS });
    if (halted) break;
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
  ledger.runs.push({ name: RUN_NAME, task: "strategy_narrative", at: new Date().toISOString(), calls: runs.length, halted });
  saveLedger(LEDGER, ledger);

  const verdicts = runs.flatMap((r) => r.run.verdicts);
  const accepted = verdicts.filter((v) => v.accepted);
  const raw = runs.flatMap((r) => ((r.run.raw as { offers?: unknown[] } | null)?.offers ?? []));
  const sorted = runs.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? null;
  const reasons: Record<string, number> = {};
  for (const v of verdicts) for (const reason of v.reasons) reasons[reason] = (reasons[reason] ?? 0) + 1;
  const summary = {
    runName: RUN_NAME, set: SET, at: new Date().toISOString(), model: provider.model, promptHash: promptHash(ASSIST_PROMPTS.strategy_narrative), halted,
    calls: runs.length, statuses: Object.fromEntries([...new Set(runs.map((r) => r.run.status))].map((s) => [s, runs.filter((r) => r.run.status === s).length])),
    offers: verdicts.length, acceptedSentences: accepted.length, rawSentences: raw.length, acceptanceRate: verdicts.length ? accepted.length / verdicts.length : null,
    rejectionReasons: reasons, N1_acceptedWithFigure: accepted.filter((v) => /[0-9₹%]/.test(v.sentence ?? "")).length,
    N4_latencyMs: { p50: pct(0.5), p95: pct(0.95) }, tokens,
  };
  mkdirSync(path.join("evaluation-assist", "results"), { recursive: true });
  writeFileSync(path.join("evaluation-assist", "results", `narrative-${RUN_NAME}.json`), JSON.stringify({ summary, runs }, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
