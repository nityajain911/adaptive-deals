import { describe, expect, it } from "vitest";
import { DATASET_DIRS, loadDataset } from "@/evaluation/gold";
import { aggregate, formatCounts, scoreCase, type Observed } from "@/evaluation/metrics";
import { casesHash, frozenRunBlockers, runCases } from "@/evaluation/runner";

const dev = loadDataset(DATASET_DIRS.development, "development");
const c = dev.find((x) => x.id === "dev-05-prompt-injection")!;
const perfect = (): Observed => ({ ...structuredClone(c.gold), requiredClarifications: [...c.gold.requiredClarifications].sort(), unsupportedKinds: [], rejectedFieldCount: 0, approvableNonFeasible: 0, structuresGenerated: 15 });

describe("count-based metrics", () => {
  it("count correct, missed, unnecessary and unsupported items exactly", () => {
    const got = perfect();
    got.fields.approvalLimitPaise = 7_000_000; // wrong value
    got.fields.latestStart = { value: "2027-01", precision: "month" }; // extracted though not stated
    got.rejectedFieldCount = 1;
    got.requiredClarifications = ["amountsIncludeGst", "nextBudget"]; // missed approvalScope, unnecessary nextBudget
    const r = scoreCase(c, got);
    expect(r).toMatchObject({ fieldsExpected: 3, fieldsCorrect: 2, unsupportedFields: 2, clarificationsRequired: 2, clarificationsAsked: 1, unnecessaryClarifications: 1, failureStateExpected: true, failureStateCorrect: true });
  });

  it("report counts only, in the freeze-pack wording", () => {
    const lines = formatCounts(aggregate([scoreCase(c, perfect())]));
    expect(lines).toContain("Correctly extracted fields: 3 of 3 expected");
    expect(lines).toContain("Failing options presented as approvable: 0 of 15 generated (target 0)");
    expect(lines.join(" ")).not.toMatch(/%/);
  });

  it("the reference-extraction run is labelled as such and reproduces every development label", async () => {
    const run = await runCases(dev, "reference_extraction");
    expect(run.mode).toBe("reference_extraction");
    expect(run.counts.correctlyExtractedFields.x).toBe(run.counts.correctlyExtractedFields.y);
    expect(run.counts.failingOptionsPresentedAsApprovable.x).toBe(0);
  });

  it("live mode refuses to run without a model provider", async () => {
    await expect(runCases(dev.slice(0, 1), "live_model")).rejects.toThrow(/live model provider/);
  });
});

describe("frozen evaluation guards", () => {
  it("refuses to run without 15–20 supplied cases, a prompt freeze and a live model", () => {
    const b = frozenRunBlockers([], false);
    expect(b).toHaveLength(3);
    expect(b.join(" ")).toMatch(/another person.*not frozen.*live model is required/s);
  });
  it("case hash changes when cases change", () => {
    expect(casesHash(dev)).not.toBe(casesHash(dev.slice(1)));
  });
});
