/**
 * Records one real Cerebras reading of each of the four evaluation documents (`data/document-eval/manifest.json`).
 *
 * The first technically valid output of each document is final and is kept as it came, misses included. A request is
 * repeated only after a technical failure, within the budget in `recording-policy.ts`. The recordings are what the
 * product replays (the demo's clean document) and what `run-document-eval.ts` scores, so nothing here is re-run later.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/record-document-readings.ts [--dry] [--only=<id>]
 *
 * Needs CEREBRAS_API_KEY in the environment. It never prints a key or the document text sent.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { liveAvailability } from "@/ai/config";
import { createLiveProvider } from "@/ai/live";
import { promptHash } from "@/ai/prompts";
import { defaultEconomics } from "@/lib/economics-default";
import { buildDocumentReadRequest } from "@/commercial-memory/upload/ai-reading";
import { decideAfterAttempt, outputContract } from "./recording-policy";
import { readManifest, sourceOf } from "./document-eval-shared";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dry = process.argv.includes("--dry");
const only = arg("only");
const MAX_REQUESTS = 6;
const OUT = path.join(process.cwd(), "data/document-readings");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const active = defaultEconomics();
  const docs = readManifest().filter((doc) => !only || doc.id === only);
  const availability = liveAvailability();
  console.log(`provider ${availability.provider}; live ${availability.available ? "available" : "NOT available"}; ${dry ? "dry run, no calls" : "recording"}`);
  const provider = dry ? null : createLiveProvider();
  if (!dry && (!provider || provider.name !== "cerebras" || provider.model !== "gpt-oss-120b")) throw new Error("Recording needs Cerebras gpt-oss-120b to be configured");
  mkdirSync(OUT, { recursive: true });
  let requests = 0;
  const report: unknown[] = [];
  for (const doc of docs) {
    const source = await sourceOf(doc);
    const request = buildDocumentReadRequest(active, source);
    console.log(`${doc.id}: ${source.content.length} chars, request ${request.inputHash.slice(0, 12)}`);
    if (dry) continue;
    if (existsSync(path.join(OUT, `${doc.id}.json`))) { console.log(`  already recorded, left as it is`); continue; }
    const attempts: { failure: string | null; schema: string | null }[] = [];
    const spent = { schemaRetries: 0, providerRetries: 0 };
    for (;;) {
      if (requests >= MAX_REQUESTS) throw new Error(`Request budget of ${MAX_REQUESTS} reached`);
      requests += 1;
      const result = await provider!.generate(request);
      const raw = result.ok ? result.raw : null;
      const contract = result.ok ? outputContract(request.schema, raw) : { valid: false as const, reason: "no output" };
      attempts.push({ failure: result.ok ? null : result.failure, schema: contract.valid ? null : contract.reason });
      const decision = decideAfterAttempt(result.ok ? { ok: true, raw } : { ok: false, failure: result.failure }, contract, spent);
      if (decision.action === "keep" && result.ok) {
        writeFileSync(path.join(OUT, `${doc.id}.json`), JSON.stringify({
          id: doc.id,
          inputHash: request.inputHash,
          promptVersion: request.prompt.version,
          promptHash: promptHash(request.prompt),
          provider: result.meta.provider,
          model: result.meta.model,
          temperature: result.meta.temperature,
          usage: result.meta.usage ?? null,
          recordedAt: new Date().toISOString(),
          rawOutput: raw,
        }, null, 2) + "\n");
        report.push({ id: doc.id, attempts });
        console.log(`  recorded after ${attempts.length} request(s)`);
        break;
      }
      if (decision.action === "stop") { report.push({ id: doc.id, attempts, stopped: decision.reason }); console.log(`  stopped: ${decision.reason}`); break; }
      if (decision.action === "retry") { if (decision.why === "schema") spent.schemaRetries += 1; else spent.providerRetries += 1; await sleep(decision.waitFor === "provider" ? 8_000 : 2_000); }
    }
  }
  if (!dry && report.length) writeFileSync(path.join(OUT, "RECORDING_REPORT.json"), JSON.stringify({ recordedAt: new Date().toISOString(), requestsMade: requests, maximumRequests: MAX_REQUESTS, documents: report }, null, 2) + "\n");
  console.log(dry ? "dry run complete" : `done; ${requests} request(s) made`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "failed"); process.exit(1); });
