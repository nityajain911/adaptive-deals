import { describe, expect, it } from "vitest";
import { detectEvidenceConflicts, type EvidenceClaim } from "@/commercial-memory/conflicts";
import { loadBundledKnowledgeSources } from "@/commercial-memory/source-schema";

const sources = loadBundledKnowledgeSources();
const claim = (sourceId: string, value: string): EvidenceClaim => ({
  id: `${sourceId}-${value}`,
  field: "services.website-fixes.listPricePaise",
  value,
  sourceId,
  quote: value,
  start: 0,
  end: value.length,
});

describe("commercial evidence conflicts", () => {
  it("requires review when active current sources disagree", () => {
    const duplicateActive = { ...sources.find((item) => item.id === "source-rate-card-2026")!, id: "source-rate-card-special" };
    const result = detectEvidenceConflicts([claim("source-rate-card-2026", "2400000"), claim(duplicateActive.id, "2600000")], [...sources, duplicateActive], "2026-10-08");
    expect(result).toEqual([{ field: "services.website-fixes.listPricePaise", values: [
      { value: "2400000", claimIds: ["source-rate-card-2026-2400000"] },
      { value: "2600000", claimIds: ["source-rate-card-special-2600000"] },
    ] }]);
  });

  it("does not let superseded, withdrawn or expired evidence create a current conflict", () => {
    const result = detectEvidenceConflicts([
      claim("source-rate-card-2026", "2400000"),
      claim("source-rate-card-2025", "2100000"),
    ], sources, "2026-10-08");
    expect(result).toEqual([]);
  });
});
