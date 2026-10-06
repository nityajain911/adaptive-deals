import { afterAll, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Spec §8.2: a live run always gets a new run ID and is written only to this machine's data
 * directory. It can never overwrite the pinned demo run, committed live runs or frozen evaluation
 * files. Uses a fake provider (the bundled synthetic replay): no external model call is made.
 */
process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-presenter-"));
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic"; // pinned to the labelled hand-written sample: this suite asserts that run
const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
  throw new Error("no network");
});
afterAll(() => fetchSpy.mockRestore());

const files = ["data/demo-run.json", "evaluation/datasets/frozen/FREEZE.json", ...readdirSync("data/live-runs").map((f) => `data/live-runs/${f}`), ...readdirSync("evaluation/results").map((f) => `evaluation/results/${f}`)];
const sha = () => files.map((f) => createHash("sha256").update(readFileSync(f)).digest("hex")).join(",");

describe("live-run isolation", () => {
  it("a live run gets a new run ID and never overwrites pinned, committed or frozen data", async () => {
    const before = sha();
    const liveRunsBefore = readdirSync("data/live-runs");
    vi.doMock("@/ai/config", async (orig) => ({ ...(await orig<typeof import("@/ai/config")>()), liveAvailability: () => ({ available: true, provider: "groq", model: "fake-model" }) }));
    vi.doMock("@/ai/live", async () => {
      const { ReplayProvider } = await import("@/ai/replay-provider");
      const run = JSON.parse(readFileSync("data/synthetic/replay/hero-synthetic-run.json", "utf8"));
      return { createLiveProvider: () => new ReplayProvider("synthetic_replay", "fake-model", run.steps) };
    });
    const svc = await import("@/lib/service");
    const s = await svc.startLiveRun();
    expect(s.run.record.runId).toMatch(/^run-live-[a-f0-9]{8}$/);
    expect(liveRunsBefore).not.toContain(`${s.run.record.runId}.json`);
    expect(existsSync(path.join(process.env.ADAPTIVE_DEALS_DATA_DIR!, "runs", `${s.run.record.runId}.json`))).toBe(true);
    expect(readdirSync("data/live-runs")).toEqual(liveRunsBefore);
    expect(sha()).toBe(before);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
