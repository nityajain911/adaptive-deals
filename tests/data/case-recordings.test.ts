import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { replayRun } from "@/ai/orchestrator";
import { promptHash, promptFor } from "@/ai/prompts";
import type { RunRecord } from "@/ai/run-record";
import { canonicalJson } from "@/domain/agreement";
import { FixedClock } from "@/domain/clock";
import { CASE_IDS, demoCase, type CaseId } from "@/data/synthetic/cases";
import { RECORDED_CASE_MESSAGES, recordedDeal } from "@/data/synthetic/recorded-conversations";
import { CASE_RECORDED_RUN_DIR, CASE_RUN_MAP_FILE, mappedCaseRun } from "@/lib/case-runs";
import { modelProvenance } from "@/lib/model-provenance";
import { strategyView } from "@/domain/strategy";
import { heroBaseline } from "../helpers";

/** Historical Groq evidence and the current exact-match Cerebras hero recording. */
const dir = path.join(process.cwd(), CASE_RECORDED_RUN_DIR);
const read = (file: string) => JSON.parse(readFileSync(path.join(dir, file), "utf8"));
const mapping = JSON.parse(readFileSync(path.join(process.cwd(), CASE_RUN_MAP_FILE), "utf8")) as Partial<Record<CaseId, string>>;
const report = read("recording-report.json");
const historical = report.acceptedRecords as Record<CaseId, string>;
const record = (id: CaseId) => read(`${historical[id]}.json`) as RunRecord;
const cerebrasReport = read("cerebras-reduced-scope-recording-report.json");
const currentHero = () => read("run-case-reduced-scope-ed5442a3.json") as RunRecord;

describe("the committed case recordings", () => {
  it("maps only the exact-match Cerebras recordings and keeps historical evidence separately", () => {
    expect(mapping).toEqual({ "reduced-scope": "run-case-reduced-scope-ed5442a3", "preserve-scope": "run-case-preserve-scope-1ec088fa", "no-fit": "run-case-no-fit-6fb4027d" });
    expect(readdirSync(dir).sort()).toEqual([
      "README.md",
      ...Object.values(historical).map((id) => `${id}.json`),
      "run-case-reduced-scope-ed5442a3.json",
      "run-case-no-fit-6fb4027d.json",
      // Recorded and kept as evidence, but not mapped: see the report for why.
      "run-case-preserve-scope-fcc306d2.json",
      "run-case-preserve-scope-ff0d6acf.json",
      "run-case-preserve-scope-9a841334.json",
      "run-case-preserve-scope-1ec088fa.json",
      "recording-report.json",
      "cerebras-reduced-scope-recording-report.json",
      "cerebras-no-fit-recording-report.json",
      "cerebras-preserve-scope-recording-report.json",
      "cerebras-preserve-scope-attempt2-recording-report.json",
      "cerebras-preserve-scope-attempt3-recording-report.json",
      "cerebras-preserve-scope-text2-recording-report.json",
    ].sort());
  });

  it.each(CASE_IDS)("%s: is a complete Groq run of the conversation it was recorded on, which is no longer a case the merchant can start", (id) => {
    const loaded = record(id);
    expect(loaded).toMatchObject({ kind: "live", status: "complete", provider: "groq", model: "openai/gpt-oss-120b" });
    expect(loaded.inputs.messages).toEqual(RECORDED_CASE_MESSAGES[id]);
    expect(modelProvenance(loaded).label).toBe("Recorded Groq output");
    expect(loaded.steps.every((step) => step.provider === "groq" && step.failure === null)).toBe(true);
    // The cases were rewritten as real-sounding chats, so the product must not present these as the case's own output.
  });

  it("loads the frozen Cerebras hero and attributes every model task to Cerebras", () => {
    const loaded = mappedCaseRun("reduced-scope");
    expect(loaded).toEqual(currentHero());
    expect(loaded).toMatchObject({ kind: "live", status: "complete", provider: "cerebras", model: "gpt-oss-120b" });
    expect(loaded!.inputs.messages).toEqual(demoCase("reduced-scope")!.deal.messages);
    expect(loaded!.steps.map((step) => [step.task, step.provider, step.outcome])).toEqual([
      ["extract", "cerebras", "accepted_with_corrections"],
      ["clarify", "cerebras", "accepted"],
      ["explain", "cerebras", "accepted_with_corrections"],
    ]);
    expect(modelProvenance(loaded!).label).toBe("Recorded Cerebras output");
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

describe("the second Cerebras recording batch", () => {
  const noFit = () => read("run-case-no-fit-6fb4027d.json") as RunRecord;
  const preserve = () => read("run-case-preserve-scope-fcc306d2.json") as RunRecord;

  it("no-fit: one request, kept as it came, and the engine reaches the case's expected outcome", () => {
    const loaded = mappedCaseRun("no-fit");
    expect(loaded).toEqual(noFit());
    expect(loaded).toMatchObject({ kind: "live", status: "complete", provider: "cerebras", model: "gpt-oss-120b" });
    expect(loaded!.inputs.messages).toEqual(demoCase("no-fit")!.deal.messages);
    expect(loaded!.steps.map((step) => [step.task, step.provider, step.outcome])).toEqual([["extract", "cerebras", "accepted"]]);
    expect(modelProvenance(loaded!).label).toBe("Recorded Cerebras output");
    expect(loaded!.engine.initial.state).toBe("no_feasible_deal");
    const report = read("cerebras-no-fit-recording-report.json");
    expect(report).toMatchObject({ provider: "cerebras", model: "gpt-oss-120b", retries: [], rejectedAttempts: [], stopped: null });
    expect(report.requests).toHaveLength(1);
  });

  it("preserve-scope: a second attempt, run on the applicant's instruction, missed in the same way and is also not mapped", () => {
    const second = read("run-case-preserve-scope-ff0d6acf.json") as RunRecord;
    expect(second).toMatchObject({ kind: "live", status: "complete", provider: "cerebras", model: "gpt-oss-120b" });
    expect(second.runId).not.toBe(preserve().runId);
    // Same input, same prompt: the model rejected the same evidence phrase and found no required services again.
    expect(second.steps[0]!.inputHash).toBe(preserve().steps[0]!.inputHash);
    expect(second.engine.rejectedFields.map((f) => f.key)).toEqual(["budget_now_period"]);
    expect(second.engine.initial.state).toBe("insufficient_information");
    // The earlier attempts were made on the earlier text, so they can never be mapped to the revised case.
    expect(mappedCaseRun("preserve-scope")!.runId).toBe("run-case-preserve-scope-1ec088fa");
    const report = read("cerebras-preserve-scope-attempt2-recording-report.json");
    expect(report.requests).toHaveLength(1);
    expect(report.summaries[0]).toMatchObject({ runId: "run-case-preserve-scope-ff0d6acf", caseCard: { agrees: false } });
    const freeze = JSON.parse(readFileSync(path.join(process.cwd(), "data/synthetic/CASE_RECORDING_FREEZE_BATCH3.json"), "utf8"));
    expect(freeze).toMatchObject({ scope: ["preserve-scope"], attempt: 2 });
    expect(freeze.resultRule).toMatch(/final, whatever it is/);
  });

  it("preserve-scope: a third attempt, again on the applicant's instruction, missed identically; no attempt was mapped", () => {
    const third = read("run-case-preserve-scope-9a841334.json") as RunRecord;
    expect(third).toMatchObject({ kind: "live", status: "complete", provider: "cerebras", model: "gpt-oss-120b" });
    expect(third.steps[0]!.inputHash).toBe(preserve().steps[0]!.inputHash);
    expect(third.engine.rejectedFields.map((f) => f.key)).toEqual(["budget_now_period"]);
    expect(third.engine.initial.state).toBe("insufficient_information");
    // The earlier attempts were made on the earlier text, so they can never be mapped to the revised case.
    expect(mappedCaseRun("preserve-scope")!.runId).toBe("run-case-preserve-scope-1ec088fa");
    const freeze = JSON.parse(readFileSync(path.join(process.cwd(), "data/synthetic/CASE_RECORDING_FREEZE_BATCH4.json"), "utf8"));
    expect(freeze).toMatchObject({ scope: ["preserve-scope"], attempt: 3 });
    expect(freeze.resultRule).toMatch(/exactly one Groq attempt follows/);
  });

  it("preserve-scope on the revised text: one valid Cerebras run that reaches the case's expected offer, mapped", () => {
    const loaded = mappedCaseRun("preserve-scope");
    expect(loaded).toEqual(read("run-case-preserve-scope-1ec088fa.json"));
    expect(loaded).toMatchObject({ kind: "live", status: "complete", provider: "cerebras", model: "gpt-oss-120b" });
    expect(loaded!.inputs.messages).toEqual(demoCase("preserve-scope")!.deal.messages);
    expect(loaded!.inputs.messages.find((m) => m.id === "preserve-3")!.text).toBe("I can release only ₹10,000 right now, as this quarter is tight.");
    expect(modelProvenance(loaded!).label).toBe("Recorded Cerebras output");
    const expected = demoCase("preserve-scope")!.expected;
    expect(loaded!.engine.initial.state).toBe(expected.engineState);
    expect(loaded!.engine.initial.structures.find((s) => s.id === loaded!.engine.initial.feasibleOrder[0])!.template).toBe(expected.recommendedTemplate);
    // The model's misses are kept: the required-services phrase matches no package (the merchant confirms it) and the GST statement was rejected as conflicting.
    expect(loaded!.engine.rejectedFields.map((f) => f.key).sort()).toEqual(["amounts_include_gst", "required_package"]);
    const report = read("cerebras-preserve-scope-text2-recording-report.json");
    expect(report.requests.map((r: { task: string }) => r.task)).toEqual(["extract", "explain"]);
    expect(report).toMatchObject({ retries: [], rejectedAttempts: [], stopped: null });
    const freeze = JSON.parse(readFileSync(path.join(process.cwd(), "data/synthetic/CASE_RECORDING_FREEZE_BATCH6.json"), "utf8"));
    expect(freeze.resultRule).toMatch(/first technically valid output is final, whatever it is/);
  });

  it("preserve-scope: the first attempt on the earlier text was recorded and kept, but missed the case's story", () => {
    const loaded = preserve();
    expect(loaded).toMatchObject({ kind: "live", status: "complete", provider: "cerebras", model: "gpt-oss-120b" });
    // Made on the earlier text of the case, which the first freeze pins; the case's text has since been revised.
    expect(createHash("sha256").update(canonicalJson(loaded.inputs.messages)).digest("hex")).toBe("a98421b32768095881447b048a786171388886f23c17ddc337324ea6c759f30f");
    expect(loaded.inputs.messages).not.toEqual(demoCase("preserve-scope")!.deal.messages);
    // The engine could not reach the offer family this case demonstrates, so the product keeps the labelled sample for it.
    expect(loaded.engine.initial.state).toBe("insufficient_information");
    expect(demoCase("preserve-scope")!.expected.engineState).toBe("options_ready");
    // The earlier attempts were made on the earlier text, so they can never be mapped to the revised case.
    expect(mappedCaseRun("preserve-scope")!.runId).toBe("run-case-preserve-scope-1ec088fa");
    const report = read("cerebras-preserve-scope-recording-report.json");
    expect(report.requests).toHaveLength(1);
    expect(report.summaries[0]).toMatchObject({ caseId: "preserve-scope", caseCard: { agrees: false } });
  });
});

describe("the current Cerebras hero recording report", () => {
  it("records three successful provider requests, no retry, and the first valid outputs", () => {
    expect(cerebrasReport).toMatchObject({ provider: "cerebras", model: "gpt-oss-120b", requestCap: 7, retries: [], rejectedAttempts: [], stopped: null });
    expect(cerebrasReport.requests).toHaveLength(3);
    expect(cerebrasReport.requests.map((request: { task: string; ok: boolean; schemaValid: boolean }) => [request.task, request.ok, request.schemaValid])).toEqual([
      ["extract", true, true],
      ["clarify", true, true],
      ["explain", true, true],
    ]);
    expect(cerebrasReport.summaries[0]).toMatchObject({ caseId: "reduced-scope", runId: "run-case-reduced-scope-ed5442a3", status: "complete", caseCard: { agrees: true } });
  });

  it("keeps the reviewer documentation aligned with the mixed recorded-and-sample product", () => {
    const readRoot = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
    const readme = readRoot("README.md");
    const demo = readRoot("DEMO_SCRIPT.md");
    const recordingReadme = readRoot(`${CASE_RECORDED_RUN_DIR}/README.md`);
    for (const text of [readme, demo, recordingReadme]) {
      expect(text).toMatch(/Recorded Cerebras output/i);
      expect(text).toMatch(/hand-written sample/i);
    }
    expect(demo).not.toMatch(/No AI runs in this demo/);
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
    expect(report.acceptedRecords).toEqual(historical);
    expect(report.invocations[1].stopped).toMatch(/still fails its schema/);
  });
});
