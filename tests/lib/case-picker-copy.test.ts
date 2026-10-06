import { describe, expect, it } from "vitest";
import { casePickerCards, CASE_SWITCH_WARNING } from "@/components/deal/case-picker";
import { allDemoCases } from "@/data/synthetic/cases";

const MODEL_OUTPUT = { "reduced-scope": "Recorded Groq output", "preserve-scope": "Sample output written by hand · no model ran", "no-fit": "Sample output written by hand · no model ran" } as const;

describe("commercial case picker copy", () => {
  it("shows three honest cases with the context needed to choose one", () => {
    const cards = casePickerCards(allDemoCases(), "reduced-scope", MODEL_OUTPUT);

    expect(cards).toHaveLength(3);
    expect(cards.filter((card) => card.current)).toHaveLength(1);
    for (const card of cards) {
      expect(card.buyer).toBeTruthy();
      expect(card.proposal).toBeTruthy();
      expect(card.barrier).toBeTruthy();
      expect(card.proofPoint).toBeTruthy();
      expect(card.provenance).toBe("Synthetic scenario");
      expect(card.actionLabel).toBe("Start this case");
    }
  });

  it("states for each case whether a model or a hand-written sample produced its outputs", () => {
    const cards = casePickerCards(allDemoCases(), "reduced-scope", MODEL_OUTPUT);
    expect(cards.map((card) => card.modelOutput)).toEqual(["Recorded Groq output", "Sample output written by hand · no model ran", "Sample output written by hand · no model ran"]);
  });

  it("warns that selecting another case replaces unfinished demo progress", () => {
    expect(CASE_SWITCH_WARNING).toBe("Starting another case resets unfinished demo progress.");
  });

  it("does not claim outcomes or model certainty that the prototype cannot prove", () => {
    const copy = JSON.stringify(casePickerCards(allDemoCases(), "reduced-scope", MODEL_OUTPUT));
    expect(copy).not.toMatch(/conversion|recovered revenue|model confidence|probability/i);
  });
});
