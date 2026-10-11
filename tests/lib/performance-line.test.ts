import { describe, expect, it } from "vitest";
import type { OutcomeSummary } from "@/lib/outcome";
import { performanceLine } from "@/lib/performance-view";

const summary = (over: Partial<OutcomeSummary>): OutcomeSummary => ({
  proposedTotalPaise: 4602000,
  acceptedTotalPaise: null,
  collected: { totalPaise: 0, prePaise: 0 },
  provisionalContributionPaise: 0,
  fullContractForecastContributionPaise: null,
  window: "in_progress",
  data: "incomplete",
  label: "Provisional",
  disclosures: [],
  inputs: { cashPrePaise: 0, estimatedFeesPaise: 0, costsIncurredPaise: 0, cutoff: "2026-10-12T00:00:00.000Z" },
  ...over,
});

describe("performanceLine", () => {
  it("never shows a ₹0 figure", () => {
    expect(performanceLine(summary({}))).toBe("Nothing collected yet. The buyer has not accepted.");
    expect(performanceLine(summary({ acceptedTotalPaise: 4602000 }))).toBe("Nothing collected yet.");
  });

  it("states what has been collected once something has", () => {
    expect(performanceLine(summary({ collected: { totalPaise: 2301000, prePaise: 1950000 } }))).toContain("23,010");
  });
});
