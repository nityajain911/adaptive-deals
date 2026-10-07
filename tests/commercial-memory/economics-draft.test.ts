import { describe, expect, it } from "vitest";
import { applyConfirmedEconomicsProposals, buildEconomicsEvidenceDraft } from "@/commercial-memory/economics-draft";
import { defaultEconomics } from "@/lib/economics-default";
import { knowledgeContentHash, loadBundledKnowledgeSources } from "@/commercial-memory/source-schema";

describe("evidence-backed Business economics drafts", () => {
  it("proposes every supported service price and cost with an exact citation", () => {
    const draft = buildEconomicsEvidenceDraft(defaultEconomics(), loadBundledKnowledgeSources(), "2026-10-08");
    expect(draft.status).toBe("ready");
    expect(draft.proposals).toHaveLength(8);
    expect(draft.proposals).toContainEqual(expect.objectContaining({
      field: "services.website-fixes.listPricePaise", proposedValue: 2_400_000, sourceId: "source-rate-card-2026", status: "supported",
    }));
    expect(draft.proposals).toContainEqual(expect.objectContaining({
      field: "services.website-fixes.directCostPaise", proposedValue: 1_200_000, sourceId: "source-cost-sheet-2026", status: "supported",
    }));
    for (const proposal of draft.proposals) expect(proposal.quote).toContain(proposal.serviceName);
  });

  it("changes only fields the merchant confirms", () => {
    const active = defaultEconomics();
    const sources = loadBundledKnowledgeSources();
    const altered = sources.map((source) => {
      if (source.id !== "source-cost-sheet-2026") return source;
      const content = source.content.replace("Website fixes,12000", "Website fixes,13000");
      return { ...source, content, contentHash: knowledgeContentHash(content) };
    });
    const draft = buildEconomicsEvidenceDraft(active, altered, "2026-10-08");
    const websiteCost = draft.proposals.find((proposal) => proposal.field === "services.website-fixes.directCostPaise")!;
    const content = applyConfirmedEconomicsProposals(active, draft, [websiteCost.id]);
    expect(content.services.find((service) => service.id === "website-fixes")!.directCostPaise).toBe(1_300_000);
    expect(content.services.find((service) => service.id === "search-marketing")!.directCostPaise).toBe(active.services.find((service) => service.id === "search-marketing")!.directCostPaise);
  });

  it("blocks a field when active evidence conflicts", () => {
    const sources = loadBundledKnowledgeSources();
    const current = sources.find((source) => source.id === "source-rate-card-2026")!;
    const content = current.content.replace("Website fixes,24000", "Website fixes,26000");
    const conflicting = { ...current, id: "source-special-rate-card", title: "Special rate card", supersedes: null, content, contentHash: knowledgeContentHash(content) };
    const draft = buildEconomicsEvidenceDraft(defaultEconomics(), [...sources, conflicting], "2026-10-08");
    expect(draft.status).toBe("conflicting_evidence");
    expect(draft.proposals.filter((proposal) => proposal.field === "services.website-fixes.listPricePaise")).toEqual(expect.arrayContaining([
      expect.objectContaining({ proposedValue: 2_400_000, status: "conflicting" }),
      expect.objectContaining({ proposedValue: 2_600_000, status: "conflicting" }),
    ]));
    expect(() => applyConfirmedEconomicsProposals(defaultEconomics(), draft, draft.proposals.map((proposal) => proposal.id))).toThrow(/conflicting/i);
  });
});
