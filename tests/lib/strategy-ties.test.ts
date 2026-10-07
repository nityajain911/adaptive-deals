import { describe, expect, it } from "vitest";
import { sameLeaderNotes } from "@/components/offer/strategy-comparison";
import { economicsLabel, illustrativeEconomicsContent } from "@/lib/economics-illustrative";
import { defaultEconomicsContent } from "@/lib/economics-default";
import { economicsContentHash } from "@/domain/business-economics";

describe("strategies that lead with the same offer", () => {
  it("points each later strategy back to the first one that leads with it", () => {
    const notes = sameLeaderNotes([
      { id: "protect_contribution", leaderId: "A" },
      { id: "preserve_scope", leaderId: "B" },
      { id: "minimise_cash_exposure", leaderId: "B" },
      { id: "lower_buyer_commitment", leaderId: "A" },
    ]);
    expect(notes).toEqual({ minimise_cash_exposure: "preserve_scope", lower_buyer_commitment: "protect_contribution" });
  });
  it("notes nothing when every leader differs, or when there is no leader", () => {
    expect(sameLeaderNotes([{ id: "protect_contribution", leaderId: "A" }, { id: "preserve_scope", leaderId: "B" }])).toEqual({});
    expect(sameLeaderNotes([{ id: "protect_contribution", leaderId: null }, { id: "preserve_scope", leaderId: null }])).toEqual({});
  });
});

describe("version labels", () => {
  it("names the examples, and says a restored default has the same values as version 1", () => {
    expect(economicsLabel(economicsContentHash(illustrativeEconomicsContent()), 2)).toBe("Illustrative");
    expect(economicsLabel(economicsContentHash(defaultEconomicsContent()), 1)).toBe("Demo defaults");
    expect(economicsLabel(economicsContentHash(defaultEconomicsContent()), 3)).toBe("Demo defaults · same values as version 1");
    expect(economicsLabel("something-else", 2)).toBeNull();
  });
});
