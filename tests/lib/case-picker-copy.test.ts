import { describe, expect, it } from "vitest";
import { casePickerCards } from "@/lib/case-picker-cards";
import { dealStatus } from "@/lib/deal-status";
import type { DealProgress } from "@/lib/progress";
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
    }
  });

  it("states for each case whether a model or a hand-written sample produced its outputs", () => {
    const cards = casePickerCards(allDemoCases(), "reduced-scope", MODEL_OUTPUT);
    expect(cards.map((card) => card.modelOutput)).toEqual(["Recorded Groq output", "Sample output written by hand · no model ran", "Sample output written by hand · no model ran"]);
  });

  it("gives each deal its own status, and invents none for a deal that was never started", () => {
    const progress = (kind: DealProgress["kind"], headline: string): DealProgress => ({ stage: "track", stages: { understand: "done", offer: "done", track: "current" }, kind, actor: null, headline, primaryAction: null, blockingReason: null, version: 1, rule: "t" });
    const cards = casePickerCards(allDemoCases(), "reduced-scope", MODEL_OUTPUT, {
      "reduced-scope": { started: true, progress: progress("action_required", "The buyer asked for a change.") },
      "preserve-scope": { started: true, progress: progress("waiting_on_buyer", "Waiting for the buyer.") },
    });
    expect(cards.map((card) => card.status.label)).toEqual(["Your move", "Waiting on buyer", "Not started"]);
    expect(cards[2]!.status.next).toBeNull();
    expect(cards.map((card) => card.started)).toEqual([true, true, false]);
  });

  it("carries each deal's conversation as written, and its situation when the run is given", () => {
    const [first] = casePickerCards(allDemoCases(), "reduced-scope", MODEL_OUTPUT);
    expect(first!.messages.length).toBeGreaterThan(3);
    expect(first!.messages.some((message) => message.author === "buyer")).toBe(true);
    expect(first!.situation).toEqual([]);
  });

  it("maps every kind of progress to a plain status", () => {
    const base: DealProgress = { stage: "track", stages: { understand: "done", offer: "done", track: "current" }, kind: "informational", actor: null, headline: "Up to date", primaryAction: null, blockingReason: null, version: 1, rule: "t" };
    expect(dealStatus({ started: true, progress: base }).label).toBe("Up to date");
    expect(dealStatus({ started: true, progress: { ...base, kind: "waiting_on_system" } }).label).toBe("Waiting on payment");
    expect(dealStatus({ started: true, progress: { ...base, kind: "terminal", stages: { understand: "done", offer: "done", track: "completed" } } })).toMatchObject({ label: "Completed", tone: "green" });
    expect(dealStatus({ started: true, progress: { ...base, kind: "terminal", stages: { understand: "done", offer: "done", track: "closed" } } }).label).toBe("Closed");
    expect(dealStatus({ started: false, progress: null })).toEqual({ label: "Not started", tone: "neutral", next: null });
  });

  it("does not claim outcomes or model certainty that the prototype cannot prove", () => {
    const copy = JSON.stringify(casePickerCards(allDemoCases(), "reduced-scope", MODEL_OUTPUT));
    expect(copy).not.toMatch(/conversion|recovered revenue|model confidence|probability/i);
  });
});
