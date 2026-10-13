/**
 * Records one real Cerebras reading of each of the buyer's five answers at the month-three review (Case C, Harbour Fresh Foods).
 *
 *   npx tsx --conditions=react-server scripts/record-review-readings.ts --freeze          # writes the pass rule; no call
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/record-review-readings.ts --dry
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/record-review-readings.ts
 *
 * The pass rule (`data/synthetic/REVIEW_READING_FREEZE_BATCH8.json`) is written and committed before any call. The first technically
 * valid output for each reply is final and is kept as it came, whether or not it matches the rule. A request is repeated only after a
 * technical failure, within the budget in `recording-policy.ts`. The product replays these recordings and checks each with code.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { liveAvailability } from "@/ai/config";
import { createLiveProvider } from "@/ai/live";
import { PROMPTS, promptHash } from "@/ai/prompts";
import { demoCase, scriptedReplyText } from "@/data/synthetic/cases";
import { heroScriptedReplies } from "@/data/synthetic/hero";
import { verifyReviewReading, buildReviewReadRequest } from "@/lib/review-reading";
import { decideAfterAttempt, outputContract } from "./recording-policy";

const CASE_ID = "reduced-scope";
const OUT = path.join(process.cwd(), "data/review-readings");
const FREEZE = path.join(process.cwd(), "data/synthetic/REVIEW_READING_FREEZE_BATCH8.json");
const MAX_REQUESTS = 8;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const REVIEW_AT = "2027-02-01T10:05:00+05:30";

const scripts = heroScriptedReplies.filter((s) => s.context === "review");
const textOf = (s: (typeof scripts)[number]) => scriptedReplyText(CASE_ID, s);
type Expected = { decision: string; change: unknown };
const expectedOf = (s: (typeof scripts)[number]): Expected => ({ decision: (s as { reviewDecision: string }).reviewDecision, change: (s as { reviewChange?: unknown }).reviewChange ?? null });

async function main() {
  const item = demoCase(CASE_ID)!;
  if (process.argv.includes("--freeze")) {
    writeFileSync(FREEZE, JSON.stringify({
      schema: "adaptive-deals.review-reading-freeze.v1",
      frozenAt: new Date().toISOString(),
      authoredBy: "Claude Code (Claude Sonnet 5.5), directed by Nitya Jain",
      authorisedBy: "Nitya Jain, \"yes go ahead\" in chat on 13 October 2026, answering the offer to have the buyer's answers at the month-three review read by Cerebras and recorded",
      provider: "cerebras",
      model: "gpt-oss-120b",
      prompt: { task: "read_review", version: PROMPTS.read_review.version, sha256: promptHash(PROMPTS.read_review) },
      case: CASE_ID,
      replies: Object.fromEntries(scripts.map((s) => [s.id, { textSha256: sha(textOf(s)), expected: expectedOf(s) }])),
      maximumProviderRequests: MAX_REQUESTS,
      retryRule: "technical failures only",
      resultRule: "one Cerebras reading per reply; its first technically valid output is final and is kept whatever it is; the product uses a reading only after code has found its phrase, amount, date and service in the reply and turned them into values; a reading that does not match the expected decision and change is kept and reported, and that reply is then not read by the model in the product; no further attempt on any provider",
      networkCallsMade: 0,
    }, null, 2) + "\n");
    console.log(`wrote ${path.relative(process.cwd(), FREEZE)}`);
    return;
  }
  const freeze = JSON.parse(readFileSync(FREEZE, "utf8")) as { frozenAt: string; replies: Record<string, { textSha256: string; expected: Expected }>; prompt: { sha256: string } };
  if (freeze.prompt.sha256 !== promptHash(PROMPTS.read_review)) throw new Error("The prompt changed after the pass rule was written");
  const dry = process.argv.includes("--dry");
  const availability = liveAvailability();
  console.log(`provider ${availability.provider}; live ${availability.available ? "available" : "NOT available"}; ${dry ? "dry run, no calls" : "recording"}`);
  const provider = dry ? null : createLiveProvider();
  if (!dry && (!provider || provider.name !== "cerebras" || provider.model !== "gpt-oss-120b")) throw new Error("Recording needs Cerebras gpt-oss-120b to be configured");
  mkdirSync(OUT, { recursive: true });
  let requests = 0;
  const report: unknown[] = [];
  for (const s of scripts) {
    const text = textOf(s);
    if (sha(text) !== freeze.replies[s.id]?.textSha256) throw new Error(`${s.id}: the reply text changed after the pass rule was written`);
    const request = buildReviewReadRequest(text);
    console.log(`${s.id}: request ${request.inputHash.slice(0, 12)}`);
    if (dry) continue;
    const file = path.join(OUT, `${s.id}.json`);
    if (existsSync(file)) { console.log("  already recorded, left as it is"); continue; }
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
        const verdict = verifyReviewReading(raw, text, REVIEW_AT, item.deal.merchant.timeZone, item.deal.packages);
        const expected = freeze.replies[s.id].expected;
        const matches = verdict.ok && verdict.reading.decision === expected.decision && JSON.stringify(verdict.reading.change) === JSON.stringify(expected.change);
        writeFileSync(file, JSON.stringify({
          id: s.id,
          case: CASE_ID,
          replyText: text,
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
        report.push({ id: s.id, attempts, codeVerdict: verdict.ok ? "accepted" : `rejected: ${verdict.reason}`, matchesPassRule: matches });
        console.log(`  recorded after ${attempts.length} request(s); code ${verdict.ok ? "accepted" : "rejected"}; matches the pass rule: ${matches}`);
        break;
      }
      if (decision.action === "stop") { report.push({ id: s.id, attempts, stopped: decision.reason }); console.log(`  stopped: ${decision.reason}`); break; }
      if (decision.action === "retry") { await sleep(decision.waitFor === "provider" ? 8_000 : 2_000); if (decision.why === "schema") spent.schemaRetries += 1; else spent.providerRetries += 1; }
    }
  }
  if (!dry && report.length) {
    writeFileSync(path.join(OUT, "RECORDING_REPORT.json"), JSON.stringify({ recordedAt: new Date().toISOString(), requestsMade: requests, maximumRequests: MAX_REQUESTS, replies: report }, null, 2) + "\n");
    console.log(`requests made: ${requests}`);
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
