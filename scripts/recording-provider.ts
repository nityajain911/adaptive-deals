import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { ModelProvider, ProviderResult, StructuredRequest } from "@/ai/provider";
import type { AiTask } from "@/ai/schemas";
import { decideAfterAttempt, outputContract, type Spent } from "./recording-policy";

export interface Ledger {
  requests: { n: number; caseId: string; task: AiTask; ok: boolean; schemaValid: boolean | null; failure: string | null; waitedMsBefore: number; retryOf: number | null }[];
  retries: { caseId: string; task: AiTask; why: "schema" | "provider"; reason: string }[];
  /** Every output the provider returned that broke the declared schema, preserved even when the step stops. Never used. */
  rejectedAttempts: { caseId: string; task: AiTask; inputHash: string; supersededRunId: string | null; reason: string; rawOutput: unknown }[];
  /** Set by the client wrapper when the provider states how long to wait. */
  retryAfterMs: number | null;
  lastRequestAt: number | null;
  modelOutputs: number;
}

export const newLedger = (): Ledger => ({ requests: [], retries: [], rejectedAttempts: [], retryAfterMs: null, lastRequestAt: null, modelOutputs: 0 });

export class Stop extends Error {}

export interface RecordingOptions {
  modelOutputCap: number;
  requestCap: number;
  paceMs: number;
  defaultRetryWaitMs: number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  log: (line: string) => void;
}

export const defaultOptions = (modelOutputCap: number, requestCap = Number.POSITIVE_INFINITY): RecordingOptions => ({
  modelOutputCap,
  requestCap,
  paceMs: 25_000,
  defaultRetryWaitMs: 60_000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  log: (line) => console.error(line),
});

/** Counts every request, paces them, and requests a step again only as the recording policy allows. */
export class RecordingProvider implements ModelProvider {
  readonly name;
  readonly model;
  private readonly kept: Record<string, ProviderResult>;
  constructor(
    private readonly inner: ModelProvider,
    private readonly caseId: string,
    private readonly ledger: Ledger,
    private readonly keptFile: string,
    /** Schema-failed attempts of a step already spent in an earlier invocation (a superseded run). */
    private readonly priorSchemaAttempts: Partial<Record<AiTask, number>> = {},
    private readonly options: RecordingOptions = defaultOptions(6),
  ) {
    this.name = inner.name;
    this.model = inner.model;
    this.kept = existsSync(keptFile) ? (JSON.parse(readFileSync(keptFile, "utf8")) as Record<string, ProviderResult>) : {};
  }

  /** Remove a step's stored output so it is requested again; returns what was stored. */
  strike(inputHash: string): ProviderResult | null {
    const stored = this.kept[inputHash] ?? null;
    delete this.kept[inputHash];
    writeFileSync(this.keptFile, JSON.stringify(this.kept, null, 2) + "\n");
    return stored;
  }

  async generate(req: StructuredRequest): Promise<ProviderResult> {
    // A step's first valid output is final: if an earlier attempt stopped after it, that same
    // output is reused here and no new call is made.
    const kept = this.kept[req.inputHash];
    if (kept) {
      this.options.log(`  ${this.caseId} · ${req.task} · reusing the first valid output from an earlier attempt; no call made`);
      return kept;
    }
    const spent: Spent = { schemaRetries: this.priorSchemaAttempts[req.task] ?? 0, providerRetries: 0 };
    let retryOf: number | null = null;
    let wait = 0;
    for (;;) {
      if (this.ledger.modelOutputs >= this.options.modelOutputCap && retryOf === null) throw new Stop("Model-output cap reached before this step; no call made");
      if (this.ledger.requests.length >= this.options.requestCap) throw new Stop("Provider-request cap reached before this request; no call made");
      const sinceLast = this.ledger.lastRequestAt === null ? Infinity : this.options.now() - this.ledger.lastRequestAt;
      // Pace every request; after a rate limit, wait for the provider's stated time instead.
      wait = retryOf !== null && this.ledger.retryAfterMs !== null ? this.ledger.retryAfterMs + 2_000 : Math.max(0, this.options.paceMs - sinceLast);
      if (retryOf !== null && this.ledger.retryAfterMs === null && wait < this.options.defaultRetryWaitMs && spent.providerRetries > 0) wait = this.options.defaultRetryWaitMs;
      if (wait > 0 && Number.isFinite(wait)) await this.options.sleep(wait);
      this.ledger.retryAfterMs = null;

      const n = this.ledger.requests.length + 1;
      const res = await this.inner.generate(req);
      this.ledger.lastRequestAt = this.options.now();
      if (res.ok) this.ledger.modelOutputs++;
      const contract = res.ok ? outputContract(req.schema, res.raw) : ({ valid: false, reason: "no output" } as const);
      this.ledger.requests.push({ n, caseId: this.caseId, task: req.task, ok: res.ok, schemaValid: res.ok ? contract.valid : null, failure: res.ok ? null : res.failure, waitedMsBefore: Number.isFinite(wait) ? wait : 0, retryOf });
      const outcome = !res.ok ? `${res.failure}: ${res.message}` : contract.valid ? "model output received, schema valid" : `model output received, ${contract.valid ? "" : contract.reason}`;
      this.options.log(`  request ${n} · ${this.caseId} · ${req.task} · ${outcome}`);

      // A schema-invalid output is evidence whatever happens next, including when the step stops.
      if (res.ok && !contract.valid) this.ledger.rejectedAttempts.push({ caseId: this.caseId, task: req.task, inputHash: req.inputHash, supersededRunId: null, reason: contract.reason, rawOutput: res.raw });

      const decision = decideAfterAttempt(res.ok ? { ok: true, raw: res.raw } : { ok: false, failure: res.failure }, contract, spent);
      if (decision.action === "keep") {
        this.kept[req.inputHash] = res;
        writeFileSync(this.keptFile, JSON.stringify(this.kept, null, 2) + "\n");
        return res;
      }
      if (decision.action === "stop") throw new Stop(`${req.task}: ${decision.reason}${!res.ok ? ` (${res.message})` : ""}`);
      this.ledger.retries.push({ caseId: this.caseId, task: req.task, why: decision.why, reason: res.ok ? (contract.valid ? "" : contract.reason) : `${res.failure}: ${res.message}` });
      if (decision.why === "schema") spent.schemaRetries++;
      else spent.providerRetries++;
      retryOf = n;
    }
  }
}
