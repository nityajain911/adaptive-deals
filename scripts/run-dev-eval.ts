/**
 * Development-set evaluation. With the configured provider's key (GROQ_API_KEY for Groq, the
 * default; ANTHROPIC_API_KEY for Anthropic) it runs the live model — a real result. Without it,
 * it runs the reference-extraction check, which tests labels and code — clearly labelled, and
 * never a model result.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createLiveProvider } from "@/ai/live";
import { DATASET_DIRS, loadDataset } from "@/evaluation/gold";
import { formatCounts } from "@/evaluation/metrics";
import { requiredKeyVar, runCases } from "@/evaluation/runner";
import { readAiConfig } from "@/ai/config";
import { PROMPTS } from "@/ai/prompts";

async function main() {
  const cases = loadDataset(DATASET_DIRS.development, "development");
  const provider = createLiveProvider();
  const forceReference = process.argv.includes("--reference");
  const mode = provider && !forceReference ? "live_model" : "reference_extraction";
  console.log(`Development set · ${cases.length} synthetic cases · mode: ${mode}`);
  const cfg = readAiConfig();
  if (mode === "reference_extraction") {
    console.log("NOTE: reference-extraction check — tests labels and deterministic code only. NOT a model result; do not report as one.");
    if (!provider) console.log(`(No live model: set ${requiredKeyVar()} for provider ${cfg.provider} to run the model.)`);
  } else console.log(`Provider: ${cfg.provider} · model: ${provider!.model} · prompts: ${Object.values(PROMPTS).map((p) => p.version).join(", ")}. Development results guide prompt changes; they are not the frozen evaluation.`);
  const { results, counts } = await runCases(cases, mode, provider ?? undefined);
  for (const line of formatCounts(counts)) console.log("  " + line);
  if (mode === "live_model") {
    // Keep every official development run's counts exactly as produced (no selective reruns).
    const dir = path.join(process.cwd(), "evaluation/results");
    mkdirSync(dir, { recursive: true });
    const versions = Object.fromEntries(Object.entries(PROMPTS).map(([k, p]) => [k, p.version]));
    const file = path.join(dir, `development-${versions.extract}-${versions.explain}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(file, JSON.stringify({ split: "development", provider: cfg.provider, model: provider!.model, promptVersions: versions, counts, results }, null, 2) + "\n");
    console.log(`Saved ${file}`);
  }
  const misses = results.filter((r) => r.fieldsCorrect < r.fieldsExpected || r.clarificationsAsked < r.clarificationsRequired || r.unnecessaryClarifications || (r.failureStateExpected && !r.failureStateCorrect));
  if (misses.length) console.log("Cases with differences: " + misses.map((m) => m.id).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
