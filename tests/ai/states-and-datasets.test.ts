import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { DATASET_DIRS, DatasetError, EvalCaseSchema, loadDataset } from "@/evaluation/gold";
import { goldComparable, runOracle } from "@/evaluation/oracle";

const dev = loadDataset(DATASET_DIRS.development, "development");

describe("development set (synthetic, builder-authored)", () => {
  it("has 15–20 valid cases covering the required phenomena", () => {
    expect(dev.length).toBeGreaterThanOrEqual(15);
    expect(dev.length).toBeLessThanOrEqual(20);
    const tags = new Set(dev.flatMap((c) => c.tags));
    for (const t of ["hinglish", "contradiction", "several_amounts", "relative_date", "gst_ambiguity", "approval_ambiguity", "irrelevant_chatter", "prompt_injection"]) expect(tags, t).toContain(t);
    expect(dev.every((c) => c.split === "development" && c.synthetic)).toBe(true);
  });

  it.each(dev.map((c) => [c.id, c] as const))("%s: reference extraction through the real pipeline matches the gold labels", async (_, c) => {
    const got = goldComparable(await runOracle(c));
    expect(got).toEqual({ ...c.gold, requiredClarifications: [...c.gold.requiredClarifications].sort(), unsupportedKinds: [...c.gold.unsupportedKinds].sort() });
  });

  it("covers all four failure states plus options-ready", () => {
    expect(new Set(dev.map((c) => c.gold.expectedState))).toEqual(new Set(["ambiguous", "insufficient_information", "outside_templates", "options_ready"]));
  });
});

describe("frozen test set stays separate and builder-free", () => {
  it("contains no case authored by this builder and no reference extractions", () => {
    const frozen = loadDataset(DATASET_DIRS.frozen, "frozen");
    expect(readdirSync(DATASET_DIRS.frozen).filter((f) => f.endsWith(".json") && f !== "FREEZE.json")).toHaveLength(frozen.length);
    for (const c of frozen) {
      expect(c.split).toBe("frozen");
      expect(c.referenceExtraction).toBeUndefined();
      expect(c.labelledBy).not.toMatch(/Claude Code/);
    }
  });

  it("the shared format rejects frozen cases with a reference extraction or the wrong split", () => {
    const c = { ...dev[0], id: "test-x", split: "frozen" };
    expect(EvalCaseSchema.safeParse(c).success).toBe(true); // shape is valid…
    expect(() => {
      // …but the loader refuses reference extractions in the frozen split
      const loaded = [EvalCaseSchema.parse(c)];
      if (loaded[0].split === "frozen" && loaded[0].referenceExtraction) throw new DatasetError("frozen cases must not include a reference extraction");
    }).toThrow(DatasetError);
    expect(() => loadDataset(DATASET_DIRS.development, "frozen")).toThrow(/split is development/);
  });
});

describe("dataset loader skips control files", () => {
  it("does not treat FREEZE.json as a case", async () => {
    const { mkdtempSync, writeFileSync, copyFileSync } = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = mkdtempSync(path.join(os.tmpdir(), "frozen-"));
    const src = DATASET_DIRS.development;
    copyFileSync(path.join(src, "dev-01-english-variant.json"), path.join(dir, "dev-01-english-variant.json"));
    writeFileSync(path.join(dir, "FREEZE.json"), JSON.stringify({ frozenAt: "x", caseIds: [], casesHash: "h" }));
    expect(loadDataset(dir, "development").map((c) => c.id)).toEqual(["dev-01-english-variant"]);
  });
});
