import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** The approved call budget (PLAN.md §5): planned 465, reserve 116, hard cap 581. */
export const BUDGET = { cap: 581, perTask: { strategy_narrative: 222 + 56, profile_extract: 108 + 27, negotiation_message: 135 + 33 } } as const;
export type BudgetTask = keyof typeof BUDGET.perTask;

export interface Ledger {
  total: number;
  byTask: Record<BudgetTask, number>;
  runs: { name: string; task: BudgetTask; at: string; calls: number; halted: string | null }[];
}

export const emptyLedger = (): Ledger => ({ total: 0, byTask: { strategy_narrative: 0, profile_extract: 0, negotiation_message: 0 }, runs: [] });
export const loadLedger = (file: string): Ledger => (existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Ledger) : emptyLedger());
export const saveLedger = (file: string, ledger: Ledger) => writeFileSync(file, JSON.stringify(ledger, null, 2) + "\n");

/** How many more calls this task may make: the lesser of its own allowance and what is left of the cap. */
export const remaining = (ledger: Ledger, task: BudgetTask): number => Math.max(0, Math.min(BUDGET.perTask[task] - ledger.byTask[task], BUDGET.cap - ledger.total));

/** Count one call. Throws when it would pass the cap, so a runner can never exceed the approved budget. */
export function spend(ledger: Ledger, task: BudgetTask): void {
  if (remaining(ledger, task) <= 0) throw new Error(`Call budget exhausted for ${task} (${ledger.byTask[task]} used; total ${ledger.total} of ${BUDGET.cap})`);
  ledger.total += 1;
  ledger.byTask[task] += 1;
}

/** Stop rules from PLAN.md §5. Returns the reason to halt, or null. */
export function haltReason(args: { calls: number; consecutiveAuthOrQuota: number; avgTokensPerCall: number | null; estimatedTokensPerCall: number }): string | null {
  if (args.consecutiveAuthOrQuota >= 2) return "two consecutive authentication or quota errors";
  if (args.calls >= 10 && args.avgTokensPerCall !== null && args.avgTokensPerCall > args.estimatedTokensPerCall * 1.5) return "measured token use is more than 50% above the estimate";
  return null;
}
