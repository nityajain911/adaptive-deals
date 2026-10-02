import { describe, expect, it } from "vitest";
import { assertDealTransition, DEAL_TRANSITIONS } from "@/domain/state";

describe("closure transitions (spec §3.1)", () => {
  it("allows closing no-feasible and outside-template results", () => {
    expect(() => assertDealTransition("no_feasible_structure", "merchant_rejected")).not.toThrow();
    expect(() => assertDealTransition("outside_templates", "merchant_rejected")).not.toThrow();
  });
  it("keeps existing closures and adds nothing else", () => {
    expect(DEAL_TRANSITIONS.options_ready).toContain("merchant_rejected");
    expect(DEAL_TRANSITIONS.approved).toContain("merchant_rejected");
    expect(() => assertDealTransition("sent", "merchant_rejected")).toThrow();
  });
});
