import { describe, expect, it } from "vitest";
import { STRATEGY_IDS } from "@/domain/strategy";
import { priorityResultNote } from "@/lib/priority-feedback";

describe("priority feedback", () => {
  it("explains a genuine tie instead of implying the selector failed", () => {
    const rows = STRATEGY_IDS.map((id) => ({ id, leaderId: "annual" }));
    expect(priorityResultNote(rows, "protect_contribution")).toBe("All four priorities lead to the same offer for this deal. Its price and payment schedule stay the same.");
  });
  it("names only the priorities that actually lead to the same offer", () => {
    const rows = STRATEGY_IDS.map((id) => ({ id, leaderId: id === "preserve_scope" || id === "minimise_cash_exposure" ? "annual" : "phase" }));
    expect(priorityResultNote(rows, "preserve_scope")).toBe("This offer also leads for Spend the least up front.");
    expect(priorityResultNote(rows, "protect_contribution")).toBe("This offer also leads for Smaller payments for them.");
  });
  it("does not claim a tie when there are no recommendations", () => {
    expect(priorityResultNote(STRATEGY_IDS.map((id) => ({ id, leaderId: null })), "protect_contribution")).toBeNull();
  });
});
