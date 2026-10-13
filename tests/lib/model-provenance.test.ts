import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RunRecord } from "@/ai/run-record";
import { clarificationDraftLabel, modelProvenance, providerDisplayName, questionWordingLabel, SAMPLE_OUTPUT_LABEL, taskProvenance } from "@/lib/model-provenance";

const read = (file: string) => JSON.parse(readFileSync(file, "utf8")) as RunRecord;
const recorded = read("data/live-runs/run-live-3f518779.json");
const samples = ["reduced-scope", "preserve-scope", "no-fit"].map((id) => read(`data/synthetic/replay/${id}-synthetic-run.json`));

/** Attribution follows the stored run kind and the provider recorded on each step. */
describe("model provenance", () => {
  it("classifies every hand-written case replay as a sample that no model produced", () => {
    for (const record of samples) {
      const p = modelProvenance(record);
      expect(p).toMatchObject({ source: "hand_written", modelMade: false, providerName: null, label: "Sample output written by hand · no model ran" });
    }
    expect(SAMPLE_OUTPUT_LABEL).toBe("Sample output written by hand · no model ran");
  });

  it("classifies a recorded live run by the provider that produced its steps", () => {
    expect(modelProvenance(recorded)).toMatchObject({ source: "recorded_model", modelMade: true, providerName: "Groq", label: "Recorded Groq output" });
    expect(modelProvenance(recorded, "fresh")).toMatchObject({ source: "live_model", modelMade: true, providerName: "Groq", label: "Live Groq output" });
  });

  it("labels Cerebras from the provider stored on each step, independent of current configuration", () => {
    process.env.ADAPTIVE_DEALS_PROVIDER = "cerebras";
    const cerebras = { ...recorded, provider: "cerebras", model: "gpt-oss-120b", steps: recorded.steps.map((step) => ({ ...step, provider: "cerebras", model: "gpt-oss-120b" })) } as RunRecord;
    expect(modelProvenance(cerebras)).toMatchObject({ providerName: "Cerebras", label: "Recorded Cerebras output" });
    expect(modelProvenance(cerebras, "fresh")).toMatchObject({ providerName: "Cerebras", label: "Live Cerebras output" });
    expect(modelProvenance(recorded)).toMatchObject({ providerName: "Groq", label: "Recorded Groq output" });
    expect(providerDisplayName("anthropic")).toBe("Anthropic");
    delete process.env.ADAPTIVE_DEALS_PROVIDER;
  });

  it("keeps the provider when a replayed record carries the replay provider name", () => {
    const replayed = { ...recorded, provider: "recorded_replay" } as RunRecord;
    expect(modelProvenance(replayed).label).toBe("Recorded Groq output");
  });

  it("never credits a model when a record marked live carries hand-written steps", () => {
    const mislabelled = { ...samples[0], kind: "live" } as RunRecord;
    expect(modelProvenance(mislabelled)).toMatchObject({ source: "hand_written", modelMade: false });
    const noSteps = { ...recorded, steps: [] } as RunRecord;
    expect(modelProvenance(noSteps).modelMade).toBe(false);
  });

  it("labels clarification wording by its actual author", () => {
    const sample = modelProvenance(samples[0]);
    const groq = modelProvenance(recorded);
    expect(questionWordingLabel("ai", sample)).toBe("Sample wording written by hand");
    expect(questionWordingLabel("ai", groq)).toBe("Suggested by AI");
    expect(questionWordingLabel("code_fallback", sample)).toBe("Drafted by code");
    expect(questionWordingLabel("code_fallback", groq)).toBe("Drafted by code");
    expect(clarificationDraftLabel("suggested_by_ai", sample)).toBe("Sample wording written by hand");
    expect(clarificationDraftLabel("suggested_by_ai", groq)).toBe("Suggested by AI");
    expect(clarificationDraftLabel("approved_and_sent_by_merchant", sample)).toBe("Approved and sent by merchant");
  });
});

/** A recorded Groq run whose explanation step was replaced by hand-written output (test-only). */
const mixed = { ...recorded, steps: recorded.steps.map((step) => (step.task === "explain" ? { ...step, provider: "synthetic_replay" } : step)) } as RunRecord;

describe("attribution per stored step", () => {
  it("credits each task to the provider recorded on its own step", () => {
    for (const task of ["extract", "clarify", "explain"] as const) {
      expect(taskProvenance(recorded, task)).toMatchObject({ modelMade: true, label: "Recorded Groq output" });
      expect(taskProvenance(samples[0], task)).toMatchObject({ modelMade: false, label: SAMPLE_OUTPUT_LABEL });
    }
    expect(taskProvenance(recorded, "extract", "fresh")?.label).toBe("Live Groq output");
  });

  it("splits a mixed run: model steps stay credited, hand-written steps do not", () => {
    expect(taskProvenance(mixed, "extract")).toMatchObject({ modelMade: true, providerName: "Groq" });
    expect(taskProvenance(mixed, "clarify")).toMatchObject({ modelMade: true, providerName: "Groq" });
    expect(taskProvenance(mixed, "explain")).toMatchObject({ modelMade: false, source: "hand_written" });
    expect(modelProvenance(mixed)).toMatchObject({ source: "mixed", modelMade: false, providerName: null, label: "Mixed sources · model output and hand-written samples" });
  });

  it("returns nothing for a task that produced no stored output", () => {
    // A sample with a step removed produces no stored output for it.
    const withoutExplain = { ...samples[2], steps: samples[2].steps.filter((step) => step.task !== "explain") } as RunRecord;
    expect(taskProvenance(withoutExplain, "explain")).toBeNull();
    const failed = { ...recorded, steps: recorded.steps.map((step) => (step.task === "explain" ? { ...step, failure: { kind: "api_error", message: "x" } } : step)) } as RunRecord;
    expect(taskProvenance(failed, "explain")).toBeNull();
    expect(taskProvenance(failed, "extract")?.modelMade).toBe(true);
  });
});
