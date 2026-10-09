import { describe, expect, it } from "vitest";
import { learningEvidence, type LearningInputs } from "@/lib/learning-evidence";

const base: LearningInputs = { selectedOption: { explicit: false }, counterOffers: [], economics: { overrides: [] }, agreements: [{ status: "active" }], amendments: [], changeRequests: [], collectedPaise: 0 };

describe("learning evidence", () => {
  it("reads every line from the deal's stored records", () => {
    const l = learningEvidence({ ...base, amendments: [{ state: "active" }], changeRequests: [{ state: "resolved" }], collectedPaise: 2_301_000 });
    expect(l.recorded).toBe("Suggested offer followed · no pricing exception · buyer accepted · 1 change request · 1 payment-date change · ₹23,010 collected");
  });
  it("records a different offer chosen, exceptions of both kinds, and a decline", () => {
    const l = learningEvidence({ ...base, selectedOption: { explicit: true }, counterOffers: [{ override: { by: "m", at: "t", checks: [], reason: "r", negativeContribution: true } }], economics: { overrides: [{}] }, agreements: [{ status: "buyer_rejected" }] });
    expect(l.recorded).toBe("You chose a different offer from the suggested one · 2 pricing exceptions · buyer declined");
  });
  it("never proposes a change from one deal, and says why", () => {
    const l = learningEvidence(base);
    expect(l.decision).toMatch(/^No policy change proposed\./);
    expect(l.decision).toMatch(/does not change your prices, limits or future offers/);
  });
  it("counts only payment dates that were actually changed", () => {
    expect(learningEvidence({ ...base, amendments: [{ state: "proposed" }, { state: "rejected" }] }).recorded).not.toMatch(/payment-date/);
  });
});
