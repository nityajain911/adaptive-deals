/**
 * Frozen test set: import, validate, freeze, run. The builder authors no frozen cases.
 *   npm run eval:frozen -- --import path/to/cases.json     validate and add cases written by another person
 *   npm run eval:frozen -- --validate-only
 *   npm run eval:frozen -- --freeze --labelled-by "Name"   record prompt + case hashes before the first run
 *   npm run eval:frozen                                     run with a live model; counts only
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createLiveProvider } from "@/ai/live";
import { PROMPTS } from "@/ai/prompts";
import { DATASET_DIRS, EvalCaseSchema, loadDataset } from "@/evaluation/gold";
import { formatCounts } from "@/evaluation/metrics";
import { casesHash, currentPromptHashes, FREEZE_FILE, frozenRunBlockers, runCases, type FreezeRecord } from "@/evaluation/runner";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const importPath = arg("--import");
  if (importPath) {
    const raw = JSON.parse(readFileSync(importPath, "utf8"));
    const list = Array.isArray(raw) ? raw : [raw];
    for (const c of list) {
      const parsed = EvalCaseSchema.parse(c);
      if (parsed.split !== "frozen" || parsed.referenceExtraction || !parsed.id.startsWith("test-")) throw new Error(`${parsed.id}: frozen cases need split "frozen", an id starting test-, and no referenceExtraction`);
      writeFileSync(path.join(DATASET_DIRS.frozen, `${parsed.id}.json`), JSON.stringify(parsed, null, 2) + "\n");
    }
    console.log(`Imported ${list.length} frozen case(s).`);
  }
  const cases = loadDataset(DATASET_DIRS.frozen, "frozen");
  console.log(`Frozen set: ${cases.length} case(s) valid.`);
  if (process.argv.includes("--validate-only") || importPath) return;

  if (process.argv.includes("--freeze")) {
    const labelledBy = arg("--labelled-by");
    if (!labelledBy) throw new Error("--labelled-by is required");
    const rec: FreezeRecord = { frozenAt: new Date().toISOString(), labelledBy, caseIds: cases.map((c) => c.id), casesHash: casesHash(cases), promptVersions: Object.fromEntries(Object.entries(PROMPTS).map(([k, p]) => [k, p.version])), promptHashes: currentPromptHashes() };
    writeFileSync(FREEZE_FILE, JSON.stringify(rec, null, 2) + "\n");
    console.log(`Frozen ${cases.length} cases and prompt versions ${Object.values(rec.promptVersions).join(", ")}.`);
    return;
  }

  const provider = createLiveProvider();
  const blockers = frozenRunBlockers(cases, !!provider);
  if (blockers.length) {
    console.log("Frozen evaluation not run:");
    for (const b of blockers) console.log("  - " + b);
    process.exitCode = 2;
    return;
  }
  const { counts, results } = await runCases(cases, "live_model", provider!);
  for (const line of formatCounts(counts)) console.log("  " + line);
  const dir = path.join(process.cwd(), "evaluation/results");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `frozen-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ model: provider!.model, promptHashes: currentPromptHashes(), counts, results }, null, 2) + "\n");
  console.log(`Saved ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
