import { beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RunRecord } from "@/ai/run-record";
import { demoCase, type CaseId } from "@/data/synthetic/cases";
import { CASE_RECORDED_RUN_DIR, CASE_RUN_MAP_FILE, caseRecordedRunById, mappedCaseRun } from "@/lib/case-runs";
import { modelProvenance } from "@/lib/model-provenance";

/**
 * TEST-ONLY fabricated records. Each takes a hand-written sample replay and relabels it as a live
 * Groq run so the loader and replay path can be exercised before any real recording exists.
 * They are written to a temporary directory and never to the repository.
 */
const fabricated = (caseId: CaseId, runId: string): RunRecord => {
  const sample = JSON.parse(readFileSync(`data/synthetic/replay/${caseId}-synthetic-run.json`, "utf8")) as RunRecord;
  return { ...sample, runId, kind: "live", provider: "groq", model: "test-fabricated-model", recordedAtWall: "2026-10-06T00:00:00.000Z", steps: sample.steps.map((step) => ({ ...step, provider: "groq", model: "test-fabricated-model" })) };
};

const RUN_ID = "run-case-reduced-scope-0a1b2c3d";

function rootWith(files: Record<string, unknown>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-case-runs-"));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), JSON.stringify(content, null, 2));
  }
  return root;
}

const recording = (runId: string) => `${CASE_RECORDED_RUN_DIR}/${runId}.json`;

describe("case recorded-run loader", () => {
  it("uses its own directory and mapping file, separate from the protected live runs", () => {
    expect(CASE_RECORDED_RUN_DIR).toBe("data/case-recorded-runs");
    expect(CASE_RUN_MAP_FILE).toBe("data/case-runs.json");
  });

  it("returns nothing when no mapping or recording exists", () => {
    expect(mappedCaseRun("reduced-scope", rootWith({}))).toBeNull();
    expect(mappedCaseRun("reduced-scope", rootWith({ [CASE_RUN_MAP_FILE]: { "reduced-scope": RUN_ID } }))).toBeNull();
    expect(mappedCaseRun("preserve-scope", rootWith({ [CASE_RUN_MAP_FILE]: { "reduced-scope": RUN_ID }, [recording(RUN_ID)]: fabricated("reduced-scope", RUN_ID) }))).toBeNull();
  });

  it("returns a mapped recording that belongs to the case and was produced by a model", () => {
    const record = fabricated("reduced-scope", RUN_ID);
    const root = rootWith({ [CASE_RUN_MAP_FILE]: { "reduced-scope": RUN_ID }, [recording(RUN_ID)]: record });
    const loaded = mappedCaseRun("reduced-scope", root);
    expect(loaded?.runId).toBe(RUN_ID);
    expect(loaded?.inputs.messages).toEqual(demoCase("reduced-scope")!.deal.messages);
    expect(modelProvenance(loaded!).label).toBe("Recorded Groq output");
    expect(caseRecordedRunById(RUN_ID, root)?.runId).toBe(RUN_ID);
  });

  it("never reads the protected live-run directory, even when the mapping names a run stored there", () => {
    const liveId = "run-live-3f518779";
    const root = rootWith({ [CASE_RUN_MAP_FILE]: { "reduced-scope": liveId }, [`data/live-runs/${liveId}.json`]: fabricated("reduced-scope", liveId) });
    expect(mappedCaseRun("reduced-scope", root)).toBeNull();
    expect(caseRecordedRunById(liveId, root)).toBeNull();
    const traversal = "../live-runs/run-live-3f518779";
    expect(caseRecordedRunById(traversal, root)).toBeNull();
    expect(mappedCaseRun("reduced-scope", rootWith({ [CASE_RUN_MAP_FILE]: { "reduced-scope": traversal }, [`data/live-runs/${liveId}.json`]: fabricated("reduced-scope", liveId) }))).toBeNull();
  });

  it.each([
    ["a run ID that names another case", (r: RunRecord) => r, "run-case-preserve-scope-0a1b2c3d"],
    ["a record whose stored ID differs from its file name", (r: RunRecord) => ({ ...r, runId: "run-case-reduced-scope-ffffffff" }), RUN_ID],
    ["a hand-written sample", (r: RunRecord) => ({ ...r, kind: "synthetic_replay" as const }), RUN_ID],
    ["a record marked live whose steps no model produced", (r: RunRecord) => ({ ...r, steps: r.steps.map((step) => ({ ...step, provider: "synthetic_replay" as const })) }), RUN_ID],
    ["an incomplete run", (r: RunRecord) => ({ ...r, status: "awaiting_clarification" as const }), RUN_ID],
    ["a different deal", (r: RunRecord) => ({ ...r, inputs: { ...r.inputs, dealId: "deal-other" } }), RUN_ID],
    ["a conversation that differs from the case by one character", (r: RunRecord) => ({ ...r, inputs: { ...r.inputs, messages: r.inputs.messages.map((m, i) => (i === 0 ? { ...m, text: `${m.text} ` } : m)) } }), RUN_ID],
  ])("rejects %s", (_label, alter, fileId) => {
    const root = rootWith({ [CASE_RUN_MAP_FILE]: { "reduced-scope": fileId }, [recording(fileId)]: alter(fabricated("reduced-scope", RUN_ID)) });
    expect(mappedCaseRun("reduced-scope", root)).toBeNull();
  });
});

describe("the product with a mapped recording", () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-case-runs-store-"));
  const root = rootWith({ [CASE_RUN_MAP_FILE]: { "reduced-scope": RUN_ID }, [recording(RUN_ID)]: fabricated("reduced-scope", RUN_ID) });
  type Svc = typeof import("@/lib/service");
  let svc: Svc;

  beforeAll(async () => {
    process.env.ADAPTIVE_DEALS_DATA_DIR = dataDir;
    process.env.ADAPTIVE_DEALS_CASE_RUN_ROOT = root;
    delete process.env.ADAPTIVE_DEALS_DEMO_RUN;
    delete process.env.GROQ_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    svc = await import("@/lib/service");
  });

  it("starts the mapped case from its recording and other cases from their samples", async () => {
    const mapped = await svc.startCase("reduced-scope");
    expect(mapped.run).toMatchObject({ viewing: "replay", sourceRunId: RUN_ID });
    expect(mapped.run.record).toMatchObject({ runId: RUN_ID, kind: "live" });
    expect(modelProvenance(mapped.run.record, mapped.run.viewing)).toMatchObject({ modelMade: true, label: "Recorded Groq output" });

    const unmapped = await svc.startCase("preserve-scope");
    expect(unmapped.run.record.kind).toBe("synthetic_replay");
    expect(modelProvenance(unmapped.run.record).modelMade).toBe(false);
  });

  it("continues the recording through the recorded answers and survives a reload", async () => {
    const { driveTo } = await import("../helpers/drive");
    await svc.startCase("reduced-scope");
    const offered = await driveTo(svc, (x) => x.status === "options_ready");
    expect(offered.decisionBranch).toBeNull();
    expect(offered.run.record.steps.map((step) => [step.task, step.provider])).toEqual([["extract", "groq"], ["clarify", "groq"], ["explain", "groq"]]);
    const reloaded = await svc.currentOutcome(await svc.getState());
    expect(reloaded.evaluation.state).toBe("options_ready");
  });

  it("keeps a changed answer as a code-computed branch of the recording", async () => {
    let s = await svc.startCase("reduced-scope");
    s = await svc.sendQuestions();
    for (const q of s.conversation.filter((item) => item.kind === "clarification")) {
      await svc.buyerReply({ inReplyTo: q.id, scriptId: q.refs.questionId === "clar-gst" ? "clar-gst-no" : "clar-approval-contract" });
    }
    s = await svc.adoptRepliesAsAnswers();
    expect(s.decisionBranch).toMatchObject({ parentRunId: RUN_ID, explanationSource: "code_fallback" });
    expect(s.run.record.runId).toBe(RUN_ID);
    await expect(svc.currentOutcome(await svc.getState())).resolves.toBeTruthy();
  });

  it("falls back to the labelled sample when the synthetic demo run is requested", async () => {
    process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic";
    try {
      const s = await svc.startCase("reduced-scope");
      expect(s.run.record.kind).toBe("synthetic_replay");
      expect(modelProvenance(s.run.record).label).toBe("Sample output written by hand · no model ran");
    } finally {
      delete process.env.ADAPTIVE_DEALS_DEMO_RUN;
    }
    // A workspace started on the sample stays on the sample, even though a recording is mapped.
    const { driveTo } = await import("../helpers/drive");
    const offered = await driveTo(svc, (x) => x.status === "options_ready");
    expect(offered.run.record.kind).toBe("synthetic_replay");
    expect(offered.run.record.steps.map((step) => step.provider)).toEqual(["synthetic_replay", "synthetic_replay", "synthetic_replay"]);
    await expect(svc.currentOutcome(await svc.getState())).resolves.toBeTruthy();
  });
});
