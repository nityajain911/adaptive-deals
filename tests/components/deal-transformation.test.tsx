import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DealTransformationCard } from "@/components/offer/deal-transformation";

describe("quote-to-offer transformation", () => {
  it("shows the original quote and adaptive offer in a responsive comparison", () => {
    const html = renderToStaticMarkup(createElement(DealTransformationCard, { value: { original: { totalPaise: 14_160_000, scopeLabel: "Full annual package", durationLabel: "12 months · 1 payment", approvalLabel: "Needs buyer approval" }, adaptive: { totalPaise: 4_602_000, scopeLabel: "Urgent work", durationLabel: "3 months · 2 payments", approvalLabel: "Buyer can approve" }, changes: ["scope", "payment_split", "approval"] } }));
    expect(html).toContain("₹1,41,600");
    expect(html).toContain("₹46,020");
  });

  it("lists what stayed once, strikes through what changed and marks what was removed", () => {
    const rows = [
      { id: "website", label: "Website fixes", was: "12 months", now: "3 months", note: null },
      { id: "social", label: "Social media", was: "12 months", now: null, note: "They said it can wait" },
      { id: "reporting", label: "Reporting", was: "3 months", now: "3 months", note: null },
    ];
    const html = renderToStaticMarkup(createElement(DealTransformationCard, { value: { rows, original: { totalPaise: 14_160_000, scopeLabel: "", durationLabel: "", approvalLabel: "" }, adaptive: { totalPaise: 4_602_000, scopeLabel: "", durationLabel: "", approvalLabel: "" }, changes: ["scope"] } }));
    expect(html).toMatch(/data-row="website" data-change="changed"/);
    expect(html).toMatch(/data-row="social" data-change="removed"/);
    expect(html).toMatch(/data-row="reporting" data-change="same"/);
    expect(html).toContain("They said it can wait");
    expect(html).toContain("line-through");
  });
});
