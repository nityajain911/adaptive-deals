/**
 * npx tsx evaluation-assist/runner/message.ts --set dev                      (dry run)
 * npx tsx evaluation-assist/runner/message.ts --set dev --execute --run-name dev-r1 [--interval-ms 8000] [--limit 5]
 * Writes accepted drafts to the result file so the applicant can rate a sample (M4).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ASSIST_PROMPTS, promptHash } from "@/assist/prompts";
import { MessageInputSchema } from "@/assist/message/schema";
import { runMessage } from "@/assist/message/run";
import { executeEval } from "./execute";
import { scoreMessageRun, summariseMessages } from "./message-score";

const set = process.argv.includes("--set") ? process.argv[process.argv.indexOf("--set") + 1] : "dev";
const dir = set === "dev" ? path.join("evaluation-assist", "cases", "negotiation_message", "dev") : path.join("evaluation-assist", "holdout-private", "negotiation_message", "holdout");
const cases = readdirSync(dir).filter((f) => f.startsWith("nm-")).sort().map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as { id: string; adversarial?: boolean; input: unknown });
const prompt = ASSIST_PROMPTS.negotiation_message;

executeEval({
  task: "negotiation_message",
  prompt: { version: prompt.version, hash: promptHash(prompt) },
  estimateTokens: 2000,
  cases,
  call: (input, provider) => runMessage(MessageInputSchema.parse(input), provider),
  summarise: (runs) => {
    const scores = runs.map((r) => scoreMessageRun(r.id, r.adversarial, r.run));
    return {
      statuses: Object.fromEntries([...new Set(runs.map((r) => r.run.status))].map((s) => [s, runs.filter((r) => r.run.status === s).length])),
      ...summariseMessages(scores),
      rejectionReasons: runs.flatMap((r) => r.run.reasons).reduce<Record<string, number>>((a, k) => ({ ...a, [k]: (a[k] ?? 0) + 1 }), {}),
      reviewSample: runs.filter((r) => r.run.template).slice(0, 20).map((r) => ({ id: r.id, draft: r.run.template })),
      perCase: scores,
    };
  },
}).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
