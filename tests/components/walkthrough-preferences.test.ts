import { describe, expect, it } from "vitest";
import { WALKTHROUGH_VERSION } from "@/lib/walkthrough";
import { DEFAULT_WALKTHROUGH_PREFERENCES, WALKTHROUGH_PREFERENCES_KEY, readWalkthroughPreferences, writeWalkthroughPreferences } from "@/components/walkthrough/preferences";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("versioned walkthrough preferences", () => {
  it.each([
    ["missing", null],
    ["malformed", "not json"],
    ["older version", JSON.stringify({ version: "buildathon.v0", dismissedWelcome: true, open: true, reviewingObjectiveId: "review_decision" })],
    ["wrong shapes", JSON.stringify({ version: WALKTHROUGH_VERSION, dismissedWelcome: "yes", open: 1, reviewingObjectiveId: [] })],
  ])("returns safe defaults for %s local data", (_name, saved) => {
    const storage = new MemoryStorage();
    if (saved !== null) storage.setItem(WALKTHROUGH_PREFERENCES_KEY, saved);
    expect(readWalkthroughPreferences(storage)).toEqual(DEFAULT_WALKTHROUGH_PREFERENCES);
  });

  it("round trips display preferences", () => {
    const storage = new MemoryStorage();
    const next = { version: WALKTHROUGH_VERSION, dismissedWelcome: true, open: true, reviewingObjectiveId: "understand_buyer" } as const;
    writeWalkthroughPreferences(storage, next);
    expect(readWalkthroughPreferences(storage)).toEqual(next);
  });

  it("never serialises commercial or deal data", () => {
    const storage = new MemoryStorage();
    writeWalkthroughPreferences(storage, {
      version: WALKTHROUGH_VERSION,
      dismissedWelcome: true,
      open: false,
      reviewingObjectiveId: null,
      caseId: "reduced-scope",
      buyer: "Kestrel Foods",
      conversation: ["secret"],
      amountPaise: 5000000,
      dealStatus: "active",
    } as never);
    const saved = storage.getItem(WALKTHROUGH_PREFERENCES_KEY)!;
    expect(saved).toBe(JSON.stringify({ version: WALKTHROUGH_VERSION, dismissedWelcome: true, open: false, reviewingObjectiveId: null }));
    expect(saved).not.toMatch(/Kestrel|reduced-scope|secret|5000000|active/);
  });
});
