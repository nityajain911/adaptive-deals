import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { ConfirmedServices, ScopeConfirmationCard } from "@/components/understand/scope-confirmation";

const quote = "We need the complete annual package—Website fixes, Search marketing, Social media and Monthly reporting—for the admissions launch";
const groq = { modelMade: true, providerName: "Groq" };
const sample = { modelMade: false, providerName: null };
const card = (extraction: typeof groq | typeof sample) => renderToStaticMarkup(createElement(ScopeConfirmationCard, { phrases: [{ rawText: "complete annual package", evidenceQuote: quote }], extraction, form: createElement("div", { "data-testid": "slot" }, "FORM") }));

describe("the unmapped-services card", () => {
  it("tells the merchant what could not be mapped, quotes the buyer exactly, and says who did what so far", () => {
    const html = card(groq);
    expect(html).toContain("We couldn&#x27;t map “complete annual package” to specific services.");
    expect(html).toContain(`“${quote}”`);
    expect(html).toContain("Groq extracted the phrase · code could not map it to a service · you confirm the services.");
    expect(html).toContain("Confirm required services");
    expect(html).toContain('data-testid="slot"');
    expect(html).toContain('data-walkthrough="scope-confirmation"');
  });

  it("names several phrases without inventing a service", () => {
    const html = renderToStaticMarkup(createElement(ScopeConfirmationCard, { phrases: [{ rawText: "the basics", evidenceQuote: "the basics" }, { rawText: "everything", evidenceQuote: "everything" }], extraction: groq, form: null }));
    expect(html).toContain("We couldn&#x27;t map “the basics” and “everything” to specific services.");
  });

  it("never credits a model when the phrase came from a hand-written sample", () => {
    const html = card(sample);
    expect(html).toContain("Phrase from the hand-written sample extraction · code could not map it to a service · you confirm the services.");
    expect(html).not.toMatch(/Groq|\bAI\b/);
  });
});

describe("the confirmed-services line", () => {
  it("lists the services the merchant confirmed and credits each party for exactly its part", () => {
    const html = renderToStaticMarkup(createElement(ConfirmedServices, { names: ["Website fixes", "Search marketing", "Social media", "Monthly reporting"], phrases: ["complete annual package"], extraction: groq }));
    expect(html).toContain("Required services confirmed by you: Website fixes, Search marketing, Social media, Monthly reporting");
    expect(html).toContain("from “complete annual package”");
    expect(html).toContain("Groq extracted the phrase · merchant confirmed the services · engine recalculated the options.");
    expect(html).toContain('data-testid="scope-confirmed"');
  });
});
