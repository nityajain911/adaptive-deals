import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { ConfirmedServices, ScopeConfirmationCard } from "@/components/understand/scope-confirmation";

const quote = "We need the complete annual package for the admissions launch";
const card = () => renderToStaticMarkup(createElement(ScopeConfirmationCard, { phrases: [{ rawText: "complete annual package", evidenceQuote: quote }], form: createElement("div", { "data-testid": "slot" }) }));

describe("the unmapped-services card", () => {
  it("tells the merchant, in plain words, what the buyer asked for and what to do", () => {
    const html = card();
    expect(html).toContain("Which services do they need?");
    expect(html).toContain("They asked for “complete annual package” but did not say which services that means.");
    expect(html).toContain("Tick the services they need.");
    expect(html).toContain('data-testid="slot"');
    expect(html).toContain('data-walkthrough="scope-confirmation"');
  });

  it("names several phrases without inventing a service", () => {
    const html = renderToStaticMarkup(createElement(ScopeConfirmationCard, { phrases: [{ rawText: "the basics", evidenceQuote: "the basics" }, { rawText: "everything", evidenceQuote: "everything" }], form: createElement("div") }));
    expect(html).toContain("They asked for “the basics” and “everything” but did not say");
  });

  it("never mentions a model or a provider on the merchant's screen", () => {
    expect(card()).not.toMatch(/Groq|\bAI\b|model/);
  });
});

describe("the confirmed-services line", () => {
  it("lists the services the merchant confirmed and the phrase they came from", () => {
    const html = renderToStaticMarkup(createElement(ConfirmedServices, { names: ["Website fixes", "Search marketing", "Social media", "Monthly reporting"], phrases: ["complete annual package"] }));
    expect(html).toContain("You confirmed they need: Website fixes, Search marketing, Social media, Monthly reporting");
    expect(html).toContain("from “complete annual package”");
    expect(html).toContain('data-testid="scope-confirmed"');
  });
});
