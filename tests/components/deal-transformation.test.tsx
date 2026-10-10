import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DealTransformationCard } from "@/components/offer/deal-transformation";

describe("quote-to-offer transformation", () => {
  it("shows the original quote and adaptive offer in a responsive comparison", () => {
    const html = renderToStaticMarkup(createElement(DealTransformationCard, { value: { original: { totalPaise: 14_160_000, scopeLabel: "Full annual package", durationLabel: "12 months · 1 payment", approvalLabel: "Needs buyer approval" }, adaptive: { totalPaise: 4_602_000, scopeLabel: "Urgent work", durationLabel: "3 months · 2 payments", approvalLabel: "Buyer can approve" }, changes: ["scope", "payment_split", "approval"] } }));
    expect(html).toContain("Original quote");
    expect(html).toContain("Adaptive offer");
    expect(html).toContain("₹1,41,600");
    expect(html).toContain("₹46,020");
    expect(html).toContain("Needs buyer approval");
    expect(html).toContain("Buyer can approve");
    expect(html).toContain("md:grid-cols");
  });
});
