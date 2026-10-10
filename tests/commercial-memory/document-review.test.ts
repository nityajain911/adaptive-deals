import { describe, expect, it } from "vitest";
import type { EconomicsEvidenceDraft } from "@/commercial-memory/economics-draft";
import { documentReview } from "@/lib/document-review";

const sources = [
  { id: "rate", title: "Rate card", status: "active" },
  { id: "cost", title: "Cost sheet", status: "active" },
  { id: "old", title: "Old rate card", status: "superseded" },
  { id: "withdrawn", title: "Withdrawn cost sheet", status: "withdrawn" },
];

const draft = (proposals: EconomicsEvidenceDraft["proposals"]): EconomicsEvidenceDraft => ({
  id: "draft", economicsVersion: 1, economicsHash: "hash", sourceSetHash: "sources", status: "ready", proposals,
});

const proposal = (overrides: Partial<EconomicsEvidenceDraft["proposals"][number]> = {}) => ({
  id: "p1", field: "services.website-fixes.directCostPaise", serviceId: "website-fixes", serviceName: "Website fixes",
  proposedValue: 1_200_000, currentValue: 1_200_000, sourceId: "cost", sourceTitle: "Cost sheet", sourceHash: "source-hash",
  quote: "Website fixes,12000", start: 0, end: 19, status: "supported" as const, ...overrides,
});

describe("document review", () => {
  it("groups active documents separately from document history", () => {
    const view = documentReview({ sources });
    expect(view.activeDocuments).toHaveLength(2);
    expect(view.historyDocuments.map((source) => source.title)).toEqual(["Old rate card", "Withdrawn cost sheet"]);
    expect(view.defaultMessage).toBe("Your offers use prices and costs from 2 active business documents.");
  });

  it("shows a compact match result when every supported value already matches", () => {
    const view = documentReview({ sources, draft: draft([proposal(), proposal({ id: "p2", field: "services.search-marketing.listPricePaise" })]) });
    expect(view.status).toBe("match");
    expect(view.message).toBe("2 values found. All already match your saved prices and costs.");
    expect(view.changes).toEqual([]);
  });

  it("shows only changed fields and keeps each exact source line", () => {
    const changed = proposal({ proposedValue: 1_600_000, quote: "Website fixes,16000", start: 5, end: 24 });
    const view = documentReview({ sources, draft: draft([proposal(), changed]) });
    expect(view.status).toBe("differences");
    expect(view.message).toBe("1 change found.");
    expect(view.changes).toEqual([expect.objectContaining({ quote: "Website fixes,16000", start: 5, end: 24, currentValue: 1_200_000, proposedValue: 1_600_000 })]);
  });
});
