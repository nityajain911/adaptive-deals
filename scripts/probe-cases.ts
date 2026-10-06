/**
 * Development probes for the three commercial cases (judge-proof spec §8.2).
 *
 * Runs the existing frozen prompts against the real model, through the real orchestrator and
 * engine, and reports what happened. Probe records are development evidence only: they are
 * written to the git-ignored data directory and are never mapped to a case.
 *
 * Each task is conditional on the state the same run chain produced. No hand-authored output is
 * substituted for a model output. The only non-model input is the simulated buyer's scripted
 * answer to a clarification question the chain itself asked.
 *
 *   npx tsx --conditions=react-server --env-file=<path to .env.local> scripts/probe-cases.ts [--dry]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Groq from "groq-sdk";
import { liveAvailability, KEY_VARS } from "@/ai/config";
import { GroqProvider } from "@/ai/groq-provider";
import { runConstruct, type RunOutcome } from "@/ai/orchestrator";
import type { ModelProvider, ProviderFailureKind, ProviderResult, StructuredRequest } from "@/ai/provider";
import type { AiTask } from "@/ai/schemas";
import { FixedClock } from "@/domain/clock";
import { demoCase, type CaseId } from "@/data/synthetic/cases";

const CALL_CAP = 5;
/** Transport failures, rate limits and malformed provider responses. A refusal is never retried. */
const TECHNICAL: ProviderFailureKind[] = ["unavailable", "api_error", "truncated", "schema_invalid"];
const MAX_RETRIES_PER_CALL = 1;

interface Ledger {
  calls: { n: number; caseId: string; task: AiTask; ok: boolean; failure: string | null; retryOf: number | null }[];
  retries: { caseId: string; task: AiTask; reason: string }[];
  notCalled: { caseId: string; task: AiTask; why: string }[];
}

/** Lets through only the tasks a probe is allowed to call, counts every request, and retries only technical failures. */
class ProbeProvider implements ModelProvider {
  readonly name;
  readonly model;
  constructor(
    private readonly inner: ModelProvider,
    private readonly caseId: string,
    private readonly allowed: ReadonlySet<AiTask>,
    private readonly ledger: Ledger,
  ) {
    this.name = inner.name;
    this.model = inner.model;
  }

  async generate(req: StructuredRequest): Promise<ProviderResult> {
    const meta = { provider: this.name, model: this.model, temperature: "not sent: probe made no call" };
    const skip = (why: string): ProviderResult => {
      this.ledger.notCalled.push({ caseId: this.caseId, task: req.task, why });
      return { ok: false, failure: "not_configured", message: `Probe made no call: ${why}`, meta };
    };
    if (!this.allowed.has(req.task)) return skip("task is outside this probe");
    let retryOf: number | null = null;
    for (let attempt = 0; ; attempt++) {
      if (this.ledger.calls.filter((c) => c.retryOf === null).length >= CALL_CAP && retryOf === null) return skip("probe call cap reached");
      const n = this.ledger.calls.length + 1;
      const res = await this.inner.generate(req);
      this.ledger.calls.push({ n, caseId: this.caseId, task: req.task, ok: res.ok, failure: res.ok ? null : res.failure, retryOf });
      if (res.ok || !TECHNICAL.includes(res.failure) || attempt >= MAX_RETRIES_PER_CALL) return res;
      this.ledger.retries.push({ caseId: this.caseId, task: req.task, reason: `${res.failure}: ${res.message}` });
      retryOf = n;
    }
  }
}

function summarise(caseId: CaseId, out: RunOutcome, answered: string[], stopped: string | null) {
  const item = demoCase(caseId)!;
  const record = out.record;
  const final = record.engine.final ?? record.engine.initial;
  const top = out.explanation ? final.structures.find((s) => s.id === out.explanation!.order[0]) : null;
  const rawExtraction = record.steps.find((s) => s.task === "extract" && s.failure === null)?.rawOutput as { fields?: { key: string; raw_text: string; evidence_quote: string; message_id: string }[]; ambiguities?: { field_key: string }[] } | undefined;
  const key = (f: { key: string; raw_text: string }) => `${f.key}=${f.raw_text}`;
  const expected = item.expected.extraction.fields.map(key);
  const actual = (rawExtraction?.fields ?? []).map(key);
  return {
    caseId,
    runId: record.runId,
    steps: record.steps.map((s) => ({ task: s.task, promptVersion: s.promptVersion, inputHash: s.inputHash.slice(0, 16), provider: s.provider, model: s.model, outcome: s.outcome, failure: s.failure, issues: s.issues })),
    extraction: {
      rawFields: rawExtraction?.fields ?? null,
      rawAmbiguities: rawExtraction?.ambiguities?.map((a) => a.field_key) ?? null,
      acceptedProfile: record.engine.profile.filter((f) => f.status !== "missing").map((f) => ({ field: f.label, status: f.status, value: f.display, confidence: f.confidence, evidence: f.evidence.map((e) => `${e.messageId}: “${e.quote}”`), note: f.note })),
      rejectedFields: record.engine.rejectedFields,
      suspectedInstructions: record.engine.suspectedInstructions,
      versusExpected: { missingFromModel: expected.filter((x) => !actual.includes(x)), extraFromModel: actual.filter((x) => !expected.includes(x)) },
    },
    engine: {
      initialState: record.engine.initial.state,
      finalState: record.engine.final?.state ?? null,
      missingRequired: final.missingRequired,
      outsideTemplates: final.outsideTemplates,
      decisionRelevantAmbiguities: record.engine.initial.ambiguities.filter((a) => a.decisionRelevant).map((a) => a.field),
      feasible: final.feasibleOrder.map((id) => final.structures.find((s) => s.id === id)).map((s) => (s ? `${s.label} [${s.template}; ${s.approval}]` : "?")),
    },
    clarification: { questions: record.displayed.questions.map((q) => ({ id: q.id, wording: q.wording, question: q.question })), answeredWithScriptedBuyerReply: answered },
    explanation: out.explanation
      ? { source: out.explanation.source, issues: out.explanation.issues, rankedFirst: top ? `${top.label} [${top.template}]` : null, notes: out.explanation.notes, comparison: out.explanation.comparison }
      : null,
    caseCard: {
      expectedEngineState: item.expected.engineState,
      expectedRecommendedTemplate: item.expected.recommendedTemplate,
      actualEngineState: final.state,
      actualRankedFirstTemplate: top?.template ?? null,
      agrees: final.state === item.expected.engineState && (top?.template ?? null) === item.expected.recommendedTemplate,
    },
    stopped,
  };
}

async function probe(caseId: CaseId, allowed: AiTask[], live: ModelProvider, ledger: Ledger) {
  const item = demoCase(caseId)!;
  const provider = new ProbeProvider(live, caseId, new Set(allowed), ledger);
  const runId = `run-probe-${caseId}-${randomUUID().slice(0, 8)}`;
  const base = { provider, kind: "live" as const, runId, clock: new FixedClock(), deal: item.deal, recordedAtWall: new Date().toISOString() };
  let out = await runConstruct(base);
  const answered: string[] = [];
  let stopped: string | null = null;

  // Continue only if this chain asked questions, and only with the simulated buyer's scripted
  // answer to each question it actually asked. An unanswerable question stops the probe.
  if (out.record.status === "awaiting_clarification" && allowed.includes("explain")) {
    const asked = out.record.displayed.questions;
    const scripted = asked.map((q) => item.expected.recordedAnswers.find((a) => a.questionId === q.id) ?? null);
    if (scripted.some((a) => a === null)) stopped = `No scripted buyer answer for: ${asked.filter((_, i) => scripted[i] === null).map((q) => q.id).join(", ")}`;
    else {
      answered.push(...asked.map((q) => q.id));
      out = await runConstruct({ ...base, answers: scripted as NonNullable<(typeof scripted)[number]>[], previous: out.record });
    }
  }
  return { out, summary: summarise(caseId, out, answered, stopped) };
}

async function main() {
  const availability = liveAvailability();
  console.log(`Provider: ${availability.provider} · model: ${availability.available ? availability.model : "(unavailable)"} · call cap: ${CALL_CAP}`);
  if (!availability.available) throw new Error(`Live model unavailable: ${availability.reason}`);
  if (availability.provider !== "groq") throw new Error("These probes are authorised for Groq only");
  if (process.argv.includes("--dry")) return console.log("Dry run: configuration is valid; no call made.");

  const apiKey = process.env[KEY_VARS.groq]!.trim();
  // The SDK's own silent retries are disabled so that every request is counted here.
  const client = new Groq({ apiKey, maxRetries: 0 });
  const live = new GroqProvider(availability.model, client as never, apiKey);
  const ledger: Ledger = { calls: [], retries: [], notCalled: [] };
  const dir = path.join(process.env.ADAPTIVE_DEALS_DATA_DIR || path.join(process.cwd(), ".data"), "probes");
  mkdirSync(dir, { recursive: true });

  const plan: [CaseId, AiTask[]][] = [
    ["reduced-scope", ["extract", "clarify", "explain"]],
    ["preserve-scope", ["extract"]],
    ["no-fit", ["extract"]],
  ];
  // `--only=<case id>` reruns a single probe, for a retry after a technical failure.
  const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
  const selected = only ? plan.filter(([caseId]) => caseId === only) : plan;
  if (only && selected.length === 0) throw new Error(`Unknown case: ${only}`);
  const summaries = [];
  let secretStored = false;
  for (const [caseId, allowed] of selected) {
    const { out, summary } = await probe(caseId, allowed, live, ledger);
    const text = JSON.stringify(out.record, null, 2);
    secretStored ||= text.includes(apiKey);
    writeFileSync(path.join(dir, `${out.record.runId}.json`), text + "\n");
    summaries.push(summary);
  }
  const report = { recordedAt: new Date().toISOString(), provider: availability.provider, model: availability.model, ledger, summaries, secretStoredInAnyRecord: secretStored };
  const reportText = JSON.stringify(report, null, 2);
  if (reportText.includes(apiKey)) throw new Error("Refusing to write a report that contains the API key");
  writeFileSync(path.join(dir, only ? `probe-report-retry-${only}.json` : "probe-report.json"), reportText + "\n");
  console.log(reportText);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
