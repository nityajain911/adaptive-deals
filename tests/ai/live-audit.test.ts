import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { FixedClock } from "@/domain/clock";
import { replayRun } from "@/ai/orchestrator";
import { PROMPT_VERSIONS, PROMPTS, promptHash } from "@/ai/prompts";
import { provenanceLabel, type RunRecord } from "@/ai/run-record";
import { heroDeal } from "@/data/synthetic/hero-run";

const dir = path.join(__dirname, "../../data/live-runs");
const runs: RunRecord[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")));

describe("committed live-run audit records", () => {
  it("include the original v1 run, unchanged", () => {
    const v1 = runs.find((r) => r.runId === "run-live-e1ddc008")!;
    expect(v1).toMatchObject({ kind: "live", status: "complete", provider: "groq", model: "openai/gpt-oss-120b", promptVersions: { extract: "extract.v1", clarify: "clarify.v1", explain: "explain.v1" } });
  });

  it("current prompts are v2 for extraction and explanation; clarification stays v1", () => {
    expect([PROMPTS.extract.version, PROMPTS.clarify.version, PROMPTS.explain.version]).toEqual(["extract.v2", "clarify.v1", "explain.v2"]);
  });

  it.each(runs.map((r) => [r.runId, r] as const))("%s: every step's prompt hash matches a published prompt version exactly", (_, r) => {
    for (const s of r.steps) expect(promptHash(PROMPT_VERSIONS[s.promptVersion])).toBe(s.promptHash);
  });

  it.each(runs.map((r) => [r.runId, r] as const))("%s: is complete and replays byte-for-byte with its own prompt versions", async (_, r) => {
    expect(r.steps.map((s) => s.task)).toEqual(["extract", "clarify", "explain"]);
    expect(r.inputs.answers.map((a) => a.questionId)).toEqual(["clar-gst", "clar-approval"]);
    expect(r.engine.final?.state).toBe("options_ready");
    const out = await replayRun(r, heroDeal(), new FixedClock());
    expect(out.record.engine).toEqual(r.engine);
    expect(out.record.displayed).toEqual(r.displayed);
    expect(provenanceLabel(r, "replay")).toBe(`Replay of an actual run · run ID ${r.runId}`);
  });
});
