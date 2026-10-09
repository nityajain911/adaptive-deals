import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { ModelProvider, ProviderResult, StructuredRequest } from "@/ai/provider";
import { defaultOptions, newLedger, RecordingProvider, Stop } from "@/scripts/recording-provider";

/** The recorder keeps what the model returned, including every schema-invalid output, and never retries more than allowed. */
const schema = z.object({ note: z.string().max(10) });
const req = (hash = "h1"): StructuredRequest => ({ task: "explain", prompt: {} as never, user: "u", schema, inputHash: hash });
const meta = { provider: "groq" as const, model: "m", temperature: "0" };
const good = { note: "ok" };
const longer = (n: number) => ({ note: "x".repeat(10 + n) });

function setup(results: ProviderResult[], opts: { cap?: number; prior?: number } = {}) {
  const calls: StructuredRequest[] = [];
  const inner: ModelProvider = { name: "groq", model: "m", generate: async (r) => (calls.push(r), results[calls.length - 1] ?? { ok: false, failure: "api_error", message: "script exhausted", meta }) };
  const waits: number[] = [];
  const ledger = newLedger();
  const keptFile = path.join(mkdtempSync(path.join(os.tmpdir(), "adaptive-recorder-")), "kept.json");
  const options = { ...defaultOptions(opts.cap ?? 6), sleep: async (ms: number) => void waits.push(ms), now: () => 1_000_000, log: () => undefined };
  const provider = new RecordingProvider(inner, "preserve-scope", ledger, keptFile, opts.prior ? { explain: opts.prior } : {}, options);
  return { provider, ledger, calls, waits, keptFile };
}
const ok = (raw: unknown): ProviderResult => ({ ok: true, raw, meta });

describe("recording provider", () => {
  it("keeps a schema-valid output as final and reuses it without another call", async () => {
    const { provider, calls, keptFile } = setup([ok(good)]);
    expect(await provider.generate(req())).toMatchObject({ ok: true, raw: good });
    expect(await provider.generate(req())).toMatchObject({ ok: true, raw: good });
    expect(calls).toHaveLength(1);
    expect(JSON.parse(readFileSync(keptFile, "utf8"))).toHaveProperty("h1");
  });

  it("requests a schema-invalid output once more and uses the first valid retry, preserving the rejected attempt", async () => {
    const { provider, ledger, calls } = setup([ok(longer(5)), ok(good)]);
    expect(await provider.generate(req())).toMatchObject({ raw: good });
    expect(calls).toHaveLength(2);
    expect(ledger.rejectedAttempts).toEqual([{ caseId: "preserve-scope", task: "explain", inputHash: "h1", supersededRunId: null, reason: expect.stringMatching(/<=10 characters/), rawOutput: longer(5) }]);
    expect(ledger.requests.map((r) => [r.ok, r.schemaValid])).toEqual([[true, false], [true, true]]);
  });

  it("stops when the rerun also fails its schema, and preserves BOTH rejected outputs", async () => {
    const { provider, ledger, keptFile } = setup([ok(longer(5)), ok(longer(9))]);
    await expect(provider.generate(req())).rejects.toThrow(Stop);
    expect(ledger.rejectedAttempts.map((a) => a.rawOutput)).toEqual([longer(5), longer(9)]);
    expect(existsSync(keptFile)).toBe(false);
  });

  it("allows exactly one rerun when an earlier invocation already spent the first attempt", async () => {
    const { provider, ledger, calls } = setup([ok(longer(7)), ok(good)], { prior: 1 });
    await expect(provider.generate(req())).rejects.toThrow(/still fails its schema/);
    expect(calls).toHaveLength(1);
    expect(ledger.rejectedAttempts.map((a) => a.rawOutput)).toEqual([longer(7)]);
  });

  it("never requests a refusal again, and never retries a refusal as a technical failure", async () => {
    const { provider, calls } = setup([{ ok: false, failure: "refusal", message: "cannot help", meta }]);
    await expect(provider.generate(req())).rejects.toThrow(/refused/i);
    expect(calls).toHaveLength(1);
  });

  it("waits for the provider's stated time after a rate limit, and falls back to a minute when none is stated", async () => {
    const stated = setup([]);
    let n = 0;
    const inner: ModelProvider = { name: "groq", model: "m", generate: async () => (++n === 1 ? (stated.ledger.retryAfterMs = 12_000, { ok: false, failure: "unavailable", message: "Model rate-limited", meta }) : ok(good)) };
    const provider = new RecordingProvider(inner, "c", stated.ledger, stated.keptFile, {}, { ...defaultOptions(6), sleep: async (ms) => void stated.waits.push(ms), now: () => 1_000_000, log: () => undefined });
    expect(await provider.generate(req())).toMatchObject({ raw: good });
    expect(stated.waits.at(-1)).toBe(14_000);
    expect(stated.ledger.rejectedAttempts).toEqual([]);

    const unstated = setup([{ ok: false, failure: "unavailable", message: "Model rate-limited", meta }, ok(good)]);
    await unstated.provider.generate(req());
    expect(unstated.waits.at(-1)).toBe(60_000);
  });

  it("refuses to start a step once the model-output cap is spent, with no call", async () => {
    const { provider, calls } = setup([ok(good), ok(good)], { cap: 1 });
    await provider.generate(req("h1"));
    await expect(provider.generate(req("h2"))).rejects.toThrow(/cap reached/i);
    expect(calls).toHaveLength(1);
  });

  it("refuses a provider request once the frozen request ceiling is spent", async () => {
    const { provider, ledger, calls, keptFile } = setup([ok(good)]);
    await provider.generate(req("h1"));
    const second = new RecordingProvider(
      { name: "groq", model: "m", generate: async (r) => (calls.push(r), ok(good)) },
      "preserve-scope",
      ledger,
      keptFile,
      {},
      { ...defaultOptions(6, 1), sleep: async () => undefined, now: () => 1_000_000, log: () => undefined },
    );
    await expect(second.generate(req("h2"))).rejects.toThrow(/request cap reached/i);
    expect(calls).toHaveLength(1);
  });

  it("can strike a stored output so that step alone is requested again", async () => {
    const { provider, calls } = setup([ok(good), ok({ note: "again" })]);
    await provider.generate(req("a"));
    provider.strike("a");
    expect(await provider.generate(req("a"))).toMatchObject({ raw: { note: "again" } });
    expect(calls).toHaveLength(2);
  });
});
