import { describe, expect, it } from "vitest";
import { negotiationView } from "@/lib/negotiation-view";
import type { CorridorView } from "@/lib/service";

const corridor = (check: CorridorView["check"]): CorridorView => ({
  currentTotalPaise: 4_602_000,
  requestedTotalPaise: check?.totalPaise ?? null,
  gstBasis: check ? "including" : null,
  check,
  lowestCompliantPaise: 4_141_800,
  lowestUnavailable: null,
  ladder: [],
  scopeAlternatives: [],
  timingAlternatives: [],
});

describe("negotiation decision view", () => {
  it("makes the buyer ask, compliant minimum and current offer explicit without relying on the chart", () => {
    const view = negotiationView({ corridor: corridor(null), buyerRequest: "Could you do ₹40,000?", step: "choose" });
    expect(view.anchors).toEqual({ buyerAskedPaise: null, safeMinimumPaise: 4_141_800, currentOfferPaise: 4_602_000 });
    expect(view.buyerRequest).toBe("Could you do ₹40,000?");
  });

  it("keeps a profitable but rule-breaking amount outside the merchant's rules", () => {
    const view = negotiationView({
      corridor: corridor({ currentTotalPaise: 4_602_000, totalPaise: 4_000_000, passes: false, contributionPaise: 1_200_000, negativeContribution: false, discountBps: 1308, failing: [{ id: "discount_limit", code: "DISCOUNT_ABOVE_LIMIT", text: "Discount is above your 10% limit" }], rules: [{ id: "discount_limit", side: "seller", passed: false, text: "Discount is above your 10% limit" }, { id: "contribution", side: "seller", passed: true, text: "Contribution meets your floor" }] }),
      buyerRequest: "Could you do ₹40,000?",
      step: "exception",
    });
    expect(view.check).toMatchObject({ totalPaise: 4_000_000, passes: false, negativeContribution: false, firstFailedRule: "Discount is above your 10% limit", failedRuleCodes: ["DISCOUNT_ABOVE_LIMIT"], needsException: true });
  });

  it("marks a loss-making amount as an exception even if no configured check fails", () => {
    const view = negotiationView({
      corridor: corridor({ currentTotalPaise: 4_602_000, totalPaise: 3_000_000, passes: true, contributionPaise: -500_000, negativeContribution: true, discountBps: 3480, failing: [], rules: [{ id: "contribution", side: "seller", passed: true, text: "Contribution floor is not configured" }] }),
      buyerRequest: "Could you do ₹30,000?",
      step: "exception",
    });
    expect(view.check).toMatchObject({ passes: true, negativeContribution: true, firstFailedRule: null, needsException: true });
  });
});
