/**
 * Development-set evaluation. With ANTHROPIC_API_KEY it runs the live model (a real result).
 * Without it, it runs the reference-extraction check, which tests labels and code — clearly
 * labelled, and never a model result.
 */
import { createLiveProvider } from "@/ai/live";
import { DATASET_DIRS, loadDataset } from "@/evaluation/gold";
import { formatCounts } from "@/evaluation/metrics";
import { runCases } from "@/evaluation/runner";

async function main() {
  const cases = loadDataset(DATASET_DIRS.development, "development");
  const provider = createLiveProvider();
  const forceReference = process.argv.includes("--reference");
  const mode = provider && !forceReference ? "live_model" : "reference_extraction";
  console.log(`Development set · ${cases.length} synthetic cases · mode: ${mode}`);
  if (mode === "reference_extraction") console.log("NOTE: reference-extraction check — tests labels and deterministic code only. NOT a model result; do not report as one.");
  else console.log(`Model: ${provider!.model}. Development results guide prompt changes; they are not the frozen evaluation.`);
  const { results, counts } = await runCases(cases, mode, provider ?? undefined);
  for (const line of formatCounts(counts)) console.log("  " + line);
  const misses = results.filter((r) => r.fieldsCorrect < r.fieldsExpected || r.clarificationsAsked < r.clarificationsRequired || r.unnecessaryClarifications || (r.failureStateExpected && !r.failureStateCorrect));
  if (misses.length) console.log("Cases with differences: " + misses.map((m) => m.id).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
