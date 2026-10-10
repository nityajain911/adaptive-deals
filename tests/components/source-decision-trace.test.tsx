import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourceDecisionTrace } from "@/components/evidence/source-decision-trace";

const html = renderToStaticMarkup(createElement(SourceDecisionTrace, {
  traces: [{
    id: "trace-1",
    sourceKind: "buyer_message",
    sourceLabel: "Buyer message",
    sourceId: "message-1",
    quote: "We have ₹50,000 this quarter",
    derivedLabel: "Budget now",
    derivedValue: "₹50,000 this quarter",
    usage: "Used to check which payments fit now",
  }],
}));

describe("source-to-decision trace", () => {
  it("renders source, understanding and decision use as readable semantic columns", () => {
    expect(html).toContain("Source");
    expect(html).toContain("Understood as");
    expect(html).toContain("Used to");
    expect(html).toContain("md:grid-cols");
    expect(html).toContain("We have ₹50,000 this quarter");
    expect(html).toContain("Budget now");
    expect(html).toContain("Used to check which payments fit now");
  });

  it("states the connection in text and gives every row a source action", () => {
    expect(html).toContain("Each row shows the source, what Adaptive Deals understood, and where it used that fact.");
    expect(html).toContain("View source");
    expect(html).toContain('data-testid="source-trace-trace-1"');
  });
});
