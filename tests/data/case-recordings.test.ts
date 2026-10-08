import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { replayRun } from "@/ai/orchestrator";
import { promptHash, promptFor } from "@/ai/prompts";
import type { RunRecord } from "@/ai/run-record";
import { FixedClock } from "@/domain/clock";
import { CASE_IDS, type CaseId } from "@/data/synthetic/cases";
import { RECORDED_CASE_MESSAGES, recordedDeal } from "@/data/synthetic/recorded-conversations";
import { CASE_RECORDED_RUN_DIR, CASE_RUN_MAP_FILE, mappedCaseRun } from "@/lib/case-runs";
import { modelProvenance } from "@/lib/model-provenance";
import { strategyView } from "@/domain/strategy";
import { heroBaseline } from "../helpers";

/**
 * The three committed case recordings are real Groq runs (kept as historical evidence; see recorded-conversations.ts) of the frozen prompts. These tests read
 * the files in the repository, with no temporary root, exactly as the product loads them.
 */
const dir = path.join(process.cwd(), CASE_RECORDED_RUN_DIR);
const read = (file: string) => JSON.parse(readFileSync(path.join(dir, file), "utf8"));
const mapping = JSON.parse(readFileSync(path.join(process.cwd(), CASE_RUN_MAP_FILE), "utf8")) as Record<CaseId, string>;
const record = (id: CaseId) => read(`${mapping[id]}.json`) as RunRecord;
const report = read("recording-report.json");

describe("the committed case recordings", () => {
  it("map every case to exactly one recording, and the directory holds nothing else", () => {
    expect(Object.keys(mapping).sort()).toEqual([...CASE_IDS].sort());
    expect(readdirSync(dir).sort()).toEqual(["README.md", ...Object.values(mapping).map((id) => `${id}.json`), "recording-report.json"].sort());
  });

  it.each(CASE_IDS)("%s: is a complete Groq run of the conversation it was recorded on, which is no longer a case the merchant can start", (id) => {
    const loaded = record(id);
    expect(loaded).toMatchObject({ kind: "live", status: "complete", provider: "groq", model: "openai/gpt-oss-120b" });
    expect(loaded.inputs.messages).toEqual(RECORDED_CASE_MESSAGES[id]);
    expect(modelProvenance(loaded).label).toBe("Recorded Groq output");
    expect(loaded.steps.every((step) => step.provider === "groq" && step.failure === null)).toBe(true);
    // The cases were rewritten as real-sounding chats, so the product must not present these as the case's own output.
    expect(mappedCaseRun(id)).toBeNull();
  });

  it.each(CASE_IDS)("%s: replays exactly, so the stored evidence still reproduces the engine's result", async (id) => {
    await expect(replayRun(record(id), recordedDeal(id), new FixedClock())).resolves.toBeTruthy();
  });

  it.each(CASE_IDS)("%s: was run with the frozen prompts, by their recorded hashes", (id) => {
    for (const step of record(id).steps) {
      expect(step.promptHash).toBe(promptHash(promptFor(step.task, step.promptVersion)));
      expect(step.promptVersion).toBe({ extract: "extract.v2", clarify: "clarify.v1", explain: "explain.v3" }[step.task]);
    }
  });

  it("contain no credential of any kind", () => {
    const files = readdirSync(dir).map((f) => readFileSync(path.join(dir, f), "utf8"));
    files.push(readFileSync(path.join(process.cwd(), CASE_RUN_MAP_FILE), "utf8"));
    const pattern = /gsk_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9_-]{16,}|rzp_(live|test)_[A-Za-z0-9]+|Bearer\s+[A-Za-z0-9._-]{16,}|api[_-]?key"\s*:\s*"[^"]{8,}/i;
    for (const text of files) expect(text).not.toMatch(pattern);
  });
});

describe("what each recording actually contains", () => {
  it("reduced scope: all three tasks produced usable output, and the model ranked the upfront payment first", async () => {
    const r = record("reduced-scope");
    expect(r.steps.map((s) => [s.task, s.outcome])).toEqual([["extract", "accepted"], ["clarify", "accepted"], ["explain", "accepted_with_corrections"]]);
    expect(r.inputs.answers.map((a) => a.value)).toEqual(["yes", "per_contract"]);
    expect(r.steps.find((s) => s.task === "explain")!.issues).toEqual(["comparison rejected: contains a literal figure, date or percentage", "note for C rejected: contains a literal figure, date or percentage"]);
    const out = await replayRun(r, recordedDeal("reduced-scope"), new FixedClock());
    const first = out.evaluation.result!.structures.find((s) => s.structure.id === out.explanation!.order[0])!;
    expect(first.structure.label).toBe("Phase 1: Website fixes + 3 months of search marketing and reporting · single payment at start");
    expect(out.explanation!.source).toEqual({ ranking: "ai", text: "code_fallback" });
  });

  it("reduced scope: code's recommendation under the default strategy is the two-payment offer, not the order the model recorded", async () => {
    const r = record("reduced-scope");
    const out = await replayRun(r, recordedDeal("reduced-scope"), new FixedClock());
    const view = strategyView(out.evaluation.result!.feasible, "protect_contribution", heroBaseline());
    expect(view.leader!.structure.id).toBe("phased_scope:scope=web-search-report-3m,plan=two_monthly");
    expect(view.leader!.structure.id).not.toBe(out.explanation!.order[0]);
    // Same offers either way: the model's recorded order is a permutation of what code ranks.
    expect([...out.explanation!.order].sort()).toEqual(view.ranked.map((x) => x.structure.id).sort());
  });

  it("preserve scope: schema-valid extraction with one rejected required-scope field, and an explanation that broke its schema", () => {
    const r = record("preserve-scope");
    expect(r.steps.map((s) => [s.task, s.outcome])).toEqual([["extract", "accepted_with_corrections"], ["explain", "rejected"]]);
    expect(r.engine.rejectedFields).toEqual([{ key: "required_package", reason: "does not match a deal package", rawText: "complete annual package" }]);
    expect(r.steps.find((s) => s.task === "explain")!.issues).toEqual(["schema: Too big: expected string to have <=240 characters"]);
    // The buyer stated the GST basis; the model did not extract it, and it stayed ambiguous.
    expect(r.engine.profile.find((f) => f.key === "amountsIncludeGst")!.status).toBe("ambiguous");
    expect(r.engine.initial.state).toBe("options_ready");
  });

  it("no fit: a clean extraction, and the engine rejects every structure", () => {
    const r = record("no-fit");
    expect(r.steps.map((s) => [s.task, s.outcome])).toEqual([["extract", "accepted"]]);
    expect(r.engine.rejectedFields).toEqual([]);
    expect(r.engine.final!.state).toBe("no_feasible_deal");
    expect(r.engine.profile.find((f) => f.key === "requiredPackages")!.display).toBe("website-fixes, search-marketing, social-media, monthly-reporting");
  });
});

describe("the recording report says exactly what happened", () => {
  it("counts seven provider requests, five usable outputs and two schema-violating attempts", () => {
    expect(report.summary).toMatchObject({ providerRequests: 7, tasksWithUsableModelOutput: 5, providerFailures: 0, refusals: 0 });
    const requests = report.invocations.flatMap((i: { requests: unknown[] }) => i.requests) as { schemaValid: boolean }[];
    expect(requests).toHaveLength(7);
    expect(requests.filter((x) => x.schemaValid)).toHaveLength(5);
    expect(report.summary.usableModelOutputs).toHaveLength(5);
    expect(report.summary.schemaViolatingAttempts).toEqual(["preserve-scope explain (attempt 1)", "preserve-scope explain (attempt 2)"]);
    expect(JSON.stringify(report)).not.toMatch(/six successful|six final calls succeeded/i);
  });

  it("preserves the first invalid output, which is the accepted record's own explanation step", () => {
    const first = report.rejectedAttempts[0];
    expect(first).toMatchObject({ attempt: 1, preserved: true, reason: "schema: Too big: expected string to have <=240 characters" });
    const stored = record("preserve-scope").steps.find((s) => s.task === "explain")!;
    expect(first.rawOutput).toEqual(stored.rawOutput);
    expect(first.inputHash).toBe(stored.inputHash);
    expect(first.rawOutput.option_notes[0].note.length).toBeGreaterThan(240);
  });

  it("says the second invalid output was not stored, and does not reconstruct it", () => {
    const second = report.rejectedAttempts[1];
    expect(second).toMatchObject({ attempt: 2, preserved: false, rawOutput: null, reason: "schema: Too big: expected string to have <=240 characters" });
    expect(second.why).toMatch(/not stored/i);
    expect(second.why).toMatch(/a52cccf/);
    expect(second.why).toMatch(/has not been reconstructed/i);
  });

  it("records the accepted record for each case", () => {
    expect(report.acceptedRecords).toEqual(mapping);
    expect(report.invocations[1].stopped).toMatch(/still fails its schema/);
  });
});
