import { readFileSync } from "node:fs";
import path from "node:path";
import type { RunRecord } from "@/ai/run-record";
import { canonicalJson } from "@/domain/agreement";
import { demoCase, type CaseId } from "@/data/synthetic/cases";
import { modelProvenance } from "./model-provenance";

/**
 * Recorded model runs for the commercial cases. They live in their own directory and never in
 * the protected historical `data/live-runs/`, which this loader does not read. A mapping entry is
 * honoured only when the stored record provably belongs to the case and a model produced it;
 * anything else yields null, and the caller falls back to the labelled hand-written sample.
 */
export const CASE_RECORDED_RUN_DIR = "data/case-recorded-runs";
export const CASE_RUN_MAP_FILE = "data/case-runs.json";

/** `run-case-<case id>-<8 hex>`: a format the historical live-run tooling never matches. */
const CASE_RUN_ID = /^run-case-([a-z]+(?:-[a-z]+)*)-[a-f0-9]{8}$/;

/** Repository root holding the recordings. The override exists so tests can use a temporary root. */
const defaultRoot = () => process.env.ADAPTIVE_DEALS_CASE_RUN_ROOT || process.cwd();

const readJson = <T>(file: string): T | null => {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
};

/** The case a run ID names, or null when the ID is not a case-run ID. */
export function caseOfRunId(runId: string): string | null {
  return CASE_RUN_ID.exec(runId)?.[1] ?? null;
}

/** A committed case recording by ID, read only from the case-recording directory. */
export function caseRecordedRunById(runId: string, root: string = defaultRoot()): RunRecord | null {
  if (!CASE_RUN_ID.test(runId)) return null;
  const record = readJson<RunRecord>(path.join(/*turbopackIgnore: true*/ root, CASE_RECORDED_RUN_DIR, `${runId}.json`));
  return record && record.runId === runId ? record : null;
}

/** The recording mapped to a case, when it is a complete model run of exactly that conversation. */
export function mappedCaseRun(caseId: CaseId, root: string = defaultRoot()): RunRecord | null {
  const item = demoCase(caseId);
  const runId = readJson<Partial<Record<CaseId, string>>>(path.join(/*turbopackIgnore: true*/ root, CASE_RUN_MAP_FILE))?.[caseId];
  if (!item || typeof runId !== "string" || caseOfRunId(runId) !== caseId) return null;
  const record = caseRecordedRunById(runId, root);
  if (!record || record.kind !== "live" || record.status !== "complete") return null;
  if (record.inputs.dealId !== item.deal.dealId || canonicalJson(record.inputs.messages) !== canonicalJson(item.deal.messages)) return null;
  return modelProvenance(record).modelMade ? record : null;
}
