import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FixedClock } from "@/domain/clock";
import { replayRun, ReplayIntegrityError, runConstruct } from "@/ai/orchestrator";
import { provenanceLabel, type RunRecord } from "@/ai/run-record";
import { heroDeal, heroRecordedAnswers } from "@/data/synthetic/hero-run";
import { SYNTHETIC_RUN_ID } from "@/data/synthetic/hero-ai-outputs";
import { heroOutputs, ScriptedProvider, syntheticHeroProvider } from "./helpers";

const stored = (): RunRecord => JSON.parse(readFileSync(path.join(__dirname, "../../data/synthetic/replay/hero-synthetic-run.json"), "utf8"));

describe("run records", () => {
  it("contain provider, model, prompt versions, run ID, inputs, raw outputs and engine result", () => {
    const r = stored();
    expect(r).toMatchObject({ runId: SYNTHETIC_RUN_ID, kind: "synthetic_replay", status: "complete", provider: "synthetic_replay", promptVersions: { extract: "extract.v1", clarify: "clarify.v1", explain: "explain.v1" } });
    expect(r.model).toMatch(/synthetic/);
    expect(r.inputs.messages.map((m) => m.id)).toEqual(["msg-1", "msg-2"]);
    expect(r.inputs.answers.map((a) => a.questionId)).toEqual(["clar-gst", "clar-approval"]);
    expect(r.steps.map((s) => s.task)).toEqual(["extract", "clarify", "explain"]);
    for (const s of r.steps) expect(s).toMatchObject({ promptVersion: expect.stringMatching(/\.v1$/), promptHash: expect.stringMatching(/^[0-9a-f]{64}$/), inputHash: expect.stringMatching(/^[0-9a-f]{64}$/), rawOutput: expect.anything() });
    expect(r.engine.initial.state).toBe("ambiguous");
    expect(r.engine.final!.state).toBe("options_ready");
    expect(r.engine.final!.templatesEvaluated).toHaveLength(4);
    expect(r.createdAt).toBe("2026-10-01T09:00:00+05:30");
  });

  it("the bundled replay is up to date with the current code", async () => {
    const first = await runConstruct({ provider: syntheticHeroProvider(), kind: "synthetic_replay", runId: SYNTHETIC_RUN_ID, clock: new FixedClock(), deal: heroDeal() });
    const done = await runConstruct({ provider: syntheticHeroProvider(), kind: "synthetic_replay", runId: SYNTHETIC_RUN_ID, clock: new FixedClock(), deal: heroDeal(), answers: heroRecordedAnswers, previous: first.record });
    expect(JSON.parse(JSON.stringify(done.record))).toEqual(stored()); // run `npm run replay:build` if this fails
  });
});

describe("replay maps to one continuous stored run", () => {
  it("replays the bundled run from its own outputs and reproduces the stored engine result", async () => {
    const out = await replayRun(stored(), heroDeal(), new FixedClock());
    expect(out.record.engine).toEqual(stored().engine);
    expect(out.record.displayed).toEqual(stored().displayed);
  });

  it("refuses a run whose stored output was altered", async () => {
    const r = stored();
    (r.steps[0].rawOutput as { fields: { raw_text: string }[] }).fields[0].raw_text = "₹5K";
    await expect(replayRun(r, heroDeal(), new FixedClock())).rejects.toThrow(ReplayIntegrityError);
  });

  it("refuses a step spliced in from a different run", async () => {
    const other = await runConstruct({ provider: new ScriptedProvider({ ...heroOutputs(), explain: { ...heroOutputs().explain, comparison: "Option A keeps every payment inside the current budget." } }), kind: "live", runId: "run-other", clock: new FixedClock(), deal: heroDeal() });
    const r = stored();
    r.steps[1] = { ...other.record.steps[1], inputHash: "0".repeat(64) };
    await expect(replayRun(r, heroDeal(), new FixedClock())).rejects.toThrow(ReplayIntegrityError);
  });

  it("refuses a run with a missing step", async () => {
    const r = stored();
    r.steps = r.steps.filter((s) => s.task !== "explain");
    await expect(replayRun(r, heroDeal(), new FixedClock())).rejects.toThrow(/never produced \(explain\)/);
  });

  it("refuses to replay a run against different messages", async () => {
    const d = heroDeal();
    d.messages[1] = { ...d.messages[1], text: "Only ₹40K left this quarter." };
    await expect(replayRun(stored(), d, new FixedClock())).rejects.toThrow(/inputs do not match/);
  });
});

describe("provenance labels", () => {
  it("say 'Synthetic replay' for the bundled run, never 'actual run'", () => {
    expect(provenanceLabel(stored(), "replay")).toBe(`Synthetic replay · run ID ${SYNTHETIC_RUN_ID}`);
    expect(provenanceLabel(stored(), "replay")).not.toMatch(/actual/);
  });
  it("say 'Replay of an actual run' only for a stored live run", () => {
    expect(provenanceLabel({ kind: "live", runId: "run-abc" }, "replay")).toBe("Replay of an actual run · run ID run-abc");
    expect(provenanceLabel({ kind: "live", runId: "run-abc" }, "fresh")).toBe("Live run · run ID run-abc");
  });
});
