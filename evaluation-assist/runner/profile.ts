/**
 * npx tsx evaluation-assist/runner/profile.ts --set dev                      (dry run)
 * npx tsx evaluation-assist/runner/profile.ts --set dev --execute --run-name dev-r1 [--interval-ms 8000] [--limit 5]
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ASSIST_PROMPTS, promptHash } from "@/assist/prompts";
import { ProfileInputSchema, ProfileOutputSchema } from "@/assist/profile/schema";
import { runProfile } from "@/assist/profile/run";
import { executeEval } from "./execute";
import { scoreProfileCase, summariseProfile, type ProfileGold } from "./profile-score";

const set = process.argv.includes("--set") ? process.argv[process.argv.indexOf("--set") + 1] : "dev";
const dir = set === "dev" ? path.join("evaluation-assist", "cases", "profile_extract", "dev") : path.join("evaluation-assist", "holdout-private", "profile_extract", "holdout");
const golds = readdirSync(dir).filter((f) => f.startsWith("pe-")).sort().map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as ProfileGold & { kind: "text" | "csv" });
const prompt = ASSIST_PROMPTS.profile_extract;

executeEval({
  task: "profile_extract",
  prompt: { version: prompt.version, hash: promptHash(prompt) },
  estimateTokens: 3500,
  cases: golds.map((g) => ({ id: g.id, adversarial: g.adversarial, input: { kind: g.kind, source: g.source } })),
  call: (input, provider) => runProfile(ProfileInputSchema.parse(input), provider),
  summarise: (runs) => {
    const scores = runs.map((r) => {
      const gold = golds.find((g) => g.id === r.id)!;
      const raw = ProfileOutputSchema.safeParse(r.run.raw);
      return scoreProfileCase(gold, raw.success ? raw.data : null, r.run.profile);
    });
    return { statuses: Object.fromEntries([...new Set(runs.map((r) => r.run.status))].map((s) => [s, runs.filter((r) => r.run.status === s).length])), ...summariseProfile(scores), perCase: scores };
  },
}).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
