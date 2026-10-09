/**
 * The shared, budget-enforcing loop for every assist evaluation run. DRY RUN BY DEFAULT: it prints what it
 * would do and makes no call. A real run needs `--execute`, a `--run-name`, the configured provider key in the environment
 * (never printed) and the applicant's approval to run. Every call is counted against the approved budget
 * before it is made, and the run halts on the stop rules in PLAN.md section 5.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { liveAvailability } from "@/ai/config";
import { createLiveAssistProvider } from "@/assist/live";
import type { AssistMeta, AssistProvider } from "@/assist/provider";
import { BUDGET, haltReason, loadLedger, remaining, saveLedger, spend, type BudgetTask } from "./budget";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (name: string) => process.argv.includes(`--${name}`);
export const LEDGER = path.join("evaluation-assist", "results", "ledger.json");

export interface Timed<R> {
  id: string;
  adversarial: boolean;
  ms: number;
  run: R;
}

export async function executeEval<R extends { status: string; meta: AssistMeta | null }>(opts: {
  task: BudgetTask;
  prompt: { version: string; hash: string };
  estimateTokens: number;
  cases: { id: string; adversarial?: boolean; input: unknown }[];
  call: (input: unknown, provider: AssistProvider) => Promise<R>;
  summarise: (runs: Timed<R>[]) => Record<string, unknown>;
}): Promise<void> {
  const set = arg("set") ?? "dev";
  const execute = flag("execute");
  const runName = arg("run-name");
  const interval = Number(arg("interval-ms") ?? 8000);
  const limit = arg("limit") ? Number(arg("limit")) : Infinity;
  const cases = opts.cases.slice(0, limit);
  const ledger = loadLedger(LEDGER);
  const left = remaining(ledger, opts.task);
  console.log(`${execute ? "EXECUTE" : "DRY RUN"} · ${opts.task} · set=${set} · cases=${cases.length} · prompt=${opts.prompt.version} (${opts.prompt.hash.slice(0, 12)}) · calls left for this task=${left} · total used ${ledger.total} of ${BUDGET.cap}`);
  if (!execute) return console.log("No call made. Add --execute --run-name <name> after approval to run.");
  if (!runName) throw new Error("--run-name is required with --execute");
  const provider = createLiveAssistProvider();
  if (!provider) {
    const availability = liveAvailability();
    throw new Error(availability.available ? "Configured model provider is unavailable" : availability.reason);
  }
  if (cases.length > left) throw new Error(`This run needs ${cases.length} calls but only ${left} remain in the budget`);
  if (set !== "dev") execFileSync("npx", ["tsx", "evaluation-assist/generators/hash-holdout.ts", "check"], { stdio: "inherit" });

  const runs: Timed<R>[] = [];
  let consecutive = 0, tokens = 0, halted: string | null = null;
  for (const c of cases) {
    spend(ledger, opts.task);
    saveLedger(LEDGER, ledger); // counted before the call, so a crash cannot hide a spent call
    const started = Date.now();
    const run = await opts.call(c.input, provider);
    runs.push({ id: c.id, adversarial: !!c.adversarial, ms: Date.now() - started, run });
    consecutive = run.status === "not_configured" || run.status === "unavailable" ? consecutive + 1 : 0;
    tokens += (run.meta?.usage?.inputTokens ?? 0) + (run.meta?.usage?.outputTokens ?? 0);
    halted = haltReason({ calls: runs.length, consecutiveAuthOrQuota: consecutive, avgTokensPerCall: tokens / runs.length, estimatedTokensPerCall: opts.estimateTokens });
    if (halted) break;
    await new Promise((r) => setTimeout(r, interval));
  }
  ledger.runs.push({ name: runName, task: opts.task, at: new Date().toISOString(), calls: runs.length, halted });
  saveLedger(LEDGER, ledger);

  const sorted = runs.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? null;
  const summary = { runName, task: opts.task, set, at: new Date().toISOString(), provider: provider.name, model: provider.model, promptVersion: opts.prompt.version, promptHash: opts.prompt.hash, halted, calls: runs.length, tokens, latencyMs: { p50: pct(0.5), p95: pct(0.95) }, ...opts.summarise(runs) };
  mkdirSync(path.join("evaluation-assist", "results"), { recursive: true });
  writeFileSync(path.join("evaluation-assist", "results", `${opts.task}-${runName}.json`), JSON.stringify({ summary, runs }, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
}
