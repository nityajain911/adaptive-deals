import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runConstruct } from "@/ai/orchestrator";
import type { ModelProvider, ProviderResult, StructuredRequest } from "@/ai/provider";
import type { RecordedAnswer, RunRecord } from "@/ai/run-record";
import { FixedClock } from "@/domain/clock";
import type { AiTask } from "@/ai/schemas";
import { demoCase, type CaseId } from "@/data/synthetic/cases";
import { CASE_RECORDED_RUN_DIR, CASE_RUN_MAP_FILE } from "@/lib/case-runs";

/**
 * TEST-ONLY recorded run of the preserve-scope case. It replays the case's extraction, which mimics the real Groq
 * extraction recorded earlier (see data/synthetic/recorded-conversations.ts) and whose `required_package` ("complete annual package") names no deal package, and
 * the real explanation that failed its schema. It is built through the real orchestrator and
 * engine, labelled as a live Groq run, and written to a temporary directory, never to the repository.
 */
export const fixture = (name: string) => (JSON.parse(readFileSync(`tests/fixtures/${name}.json`, "utf8")) as { rawOutput: unknown }).rawOutput;

/** A provider labelled as Groq that returns scripted raw outputs; any task without one is not configured. */
class ScriptedGroq implements ModelProvider {
  readonly name = "groq" as const;
  readonly model = "test-fabricated-model";
  constructor(private readonly outputs: Partial<Record<AiTask, unknown>>) {}
  async generate(req: StructuredRequest): Promise<ProviderResult> {
    const meta = { provider: this.name, model: this.model, temperature: "0" };
    return req.task in this.outputs ? { ok: true, raw: this.outputs[req.task], meta } : { ok: false, failure: "not_configured", message: "not scripted", meta };
  }
}

/**
 * A recorded run of any case, built through the real orchestrator and engine from scripted outputs.
 * With answers it continues the run the way the recorder does, so the record is complete.
 */
export async function recordedRun(args: { caseId: CaseId; runId: string; outputs: Partial<Record<AiTask, unknown>>; answers?: RecordedAnswer[] }): Promise<RunRecord> {
  const base = { provider: new ScriptedGroq(args.outputs), kind: "live" as const, runId: args.runId, clock: new FixedClock(), deal: demoCase(args.caseId)!.deal, recordedAtWall: "2026-10-06T00:00:00.000Z" };
  const first = await runConstruct(base);
  return args.answers?.length ? (await runConstruct({ ...base, answers: args.answers, previous: first.record })).record : first.record;
}

/** A temporary repository root holding recordings and their case mapping. */
export function rootWith(records: { caseId: CaseId; record: RunRecord }[]): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-recorded-"));
  mkdirSync(path.join(root, CASE_RECORDED_RUN_DIR), { recursive: true });
  for (const { record } of records) writeFileSync(path.join(root, CASE_RECORDED_RUN_DIR, `${record.runId}.json`), JSON.stringify(record));
  writeFileSync(path.join(root, CASE_RUN_MAP_FILE), JSON.stringify(Object.fromEntries(records.map(({ caseId, record }) => [caseId, record.runId]))));
  return root;
}

export const PRESERVE_RUN_ID = "run-case-preserve-scope-0a1b2c3d";
export const PRESERVE_OUTPUTS = { extract: demoCase("preserve-scope")!.expected.extraction, explain: fixture("preserve-scope-explain-schema-invalid") };

export const recordedPreserveScope = () => recordedRun({ caseId: "preserve-scope", runId: PRESERVE_RUN_ID, outputs: PRESERVE_OUTPUTS });

/** The recorded preserve-scope run in a temporary root, as the product would load it. */
export async function recordedRoot(): Promise<string> {
  return rootWith([{ caseId: "preserve-scope", record: await recordedPreserveScope() }]);
}
