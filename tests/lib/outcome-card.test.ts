import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DeclineReasonSelect } from "@/components/client";
import { ClosedSummary } from "@/components/offer/closed-summary";
import { LEARNING_POLICY, OutcomeCard } from "@/components/outcome-card";
import { BUYER_DECLINE_REASONS } from "@/lib/deal-records";
import type { OutcomeSummary } from "@/lib/outcome";

const summary: OutcomeSummary = {
  proposedTotalPaise: 4_602_000,
  acceptedTotalPaise: 4_602_000,
  collected: { totalPaise: 2_301_000, prePaise: 1_950_000 },
  provisionalContributionPaise: 1_103_980,
  fullContractForecastContributionPaise: 1_932_960,
  window: "in_progress",
  data: "incomplete",
  label: "Window in progress · incomplete inputs",
  disclosures: [
    "Refund data is not modelled in this prototype. No refund amount has been assumed.",
    "Estimated payment fees at configured rate (2%) — not an actual settled Razorpay fee record.",
    "Includes modelled costs incurred up to the measurement cutoff. Irrevocably committed future costs are not modelled.",
    "Modelled from planned service dates; actual delivery is not recorded.",
  ],
  inputs: {
    cashPrePaise: 1_950_000,
    estimatedFeesPaise: 46_020,
    costsIncurredPaise: 800_000,
    cutoff: "2026-11-28T12:30:00+05:30",
  },
};

describe("Outcome and learning card", () => {
  const html = renderToStaticMarkup(
    OutcomeCard({
      summary,
      signals: [{ id: "out-1", label: "Buyer accepted offer version 1", at: "2026-10-01T09:30:00+05:30" }],
    }),
  );

  it("keeps the decision-level values visible and names initial versus current terms", () => {
    expect(html).toContain("Outcome and learning");
    expect(html).toContain("Provisional through 28 Nov 2026");
    expect(html).toContain("₹11,039.80");
    expect(html).toContain("Initial offer sent");
    expect(html).toContain("Current accepted contract");
    expect(html).toContain("Payments recorded within the 90-day window");
    expect(html).toContain("Full-contract forecast");
    expect(html).toContain("Modelled from planned service dates; actual delivery is not recorded.");
    expect(html).toContain("Measurement cutoff");
    expect(html).toContain("₹23,010");
    expect(html).toContain("₹19,500 excl. GST");
  });

  it("puts methodology, signals and the full learning policy in collapsed disclosures", () => {
    expect(html).toContain('<details data-testid="outcome-calculation"');
    expect(html).toContain('<details data-testid="outcome-signals"');
    expect(html).toContain('<details data-testid="outcome-learning"');
    expect(html).not.toMatch(/<details[^>]*data-testid="outcome-(?:calculation|signals|learning)"[^>]* open/);
    expect(html.replaceAll("&#x27;", "'")).toContain(LEARNING_POLICY);
    expect(html).toContain("Buyer accepted offer version 1");
    for (const disclosure of summary.disclosures) expect(html).toContain(disclosure);
  });

  it("uses realised contribution only as the named target metric, never as a displayed result", () => {
    expect(html.match(/realised contribution within 90 days per eligible stalled deal/g)).toHaveLength(1);
    expect(html).not.toMatch(/Realised contribution[^<]*₹/i);
    expect(html).not.toMatch(/revenue recovered|cash recovered|guaranteed contribution/i);
  });
});

describe("Closed-before-send summary", () => {
  it("reports only Adaptive Deals records and keeps the denominator inclusion visible", () => {
    const html = renderToStaticMarkup(
      ClosedSummary({ proposedTotalPaise: 4_602_000, reason: "Margin or contribution too low", note: null, closedAt: "2026-10-01T09:25:00+05:30" }),
    );
    expect(html).toContain("Proposed value");
    expect(html).toContain("Accepted contract");
    expect(html).toContain("Not accepted");
    expect(html).toContain("Payments recorded in Adaptive Deals: ₹0");
    expect(html).not.toContain("Verified cash");
    expect(html).toContain("Measurement: Included");
    expect(html).toContain("This does not establish that no money was received elsewhere");
  });
});

describe("Buyer decline reason", () => {
  it("offers an explicit empty choice and every stable reason label", () => {
    const html = renderToStaticMarkup(DeclineReasonSelect({ value: "", onChange: () => undefined }));
    const text = html.replaceAll("&#x27;", "'");
    expect(html).toContain("Prefer not to say");
    for (const label of Object.values(BUYER_DECLINE_REASONS)) expect(text).toContain(label);
  });
});
