import { describe, expect, it } from "vitest";
import { profileFrom, clarifiedHeroProfile } from "../helpers";
import { originalProposal } from "@/lib/offer-copy";
import { blockingLines, uncapturedLines } from "@/lib/understand-copy";
import { readFileSync } from "node:fs";
import { interpretExtraction } from "@/ai/extract";
import { demoCase } from "@/data/synthetic/cases";
import { evaluateDeal } from "@/domain/engine";

/** Spec §4: "What's blocking this deal", with GST basis and precision preserved. */
describe("blocking lines", () => {
  it("confirmed profile keeps the GST basis, quarter end, month precision and per-contract scope", () => {
    expect(blockingLines(clarifiedHeroProfile(), originalProposal())).toEqual([
      "Original annual proposal: ₹1,41,600 including GST",
      "Current-quarter budget: ₹50,000 including GST, until 31 Dec 2026",
      "Next budget: April 2027 · exact day not provided",
      "Contracts above ₹60,000 including GST require MD approval (per contract)",
    ]);
  });
  it("marks unconfirmed facts inline instead of guessing", () => {
    const lines = blockingLines(profileFrom(), originalProposal());
    expect(lines[1]).toBe("Current-quarter budget: ₹50,000 (GST basis not confirmed), until 31 Dec 2026");
    expect(lines[3]).toBe("Above ₹60,000 (GST basis not confirmed) requires MD approval (per payment or per contract not confirmed)");
  });
  it("never implies a day for a month-precision budget or a live WhatsApp link", () => {
    const all = [...blockingLines(clarifiedHeroProfile(), originalProposal()), ...blockingLines(profileFrom(), originalProposal())].join(" ");
    expect(all).not.toMatch(/1 Apr|via WhatsApp/);
  });
});

/** A fact the conversation did not state, which changes no structure's outcome, is disclosed rather than asked about. */
describe("facts not captured that change nothing", () => {
  const deal = demoCase("preserve-scope")!.deal;
  const input = { merchant: deal.merchant, packages: deal.packages, templates: deal.templates };
  const raw = (JSON.parse(readFileSync("tests/fixtures/preserve-scope-extract.json", "utf8")) as { rawOutput: unknown }).rawOutput;
  const profile = interpretExtraction(raw, { dealId: deal.dealId, messages: deal.messages, packages: deal.packages, timeZone: deal.merchant.timeZone }).profile;

  it("says the GST basis was not captured and that every structure has the same outcome either way", () => {
    const evaluation = evaluateDeal(profile, input);
    expect(evaluation.state).toBe("options_ready");
    expect(profile.amountsIncludeGst.status).toBe("ambiguous");
    expect(uncapturedLines(evaluation)).toEqual(["The GST basis was not captured from the conversation. Every structure has the same outcome under either reading, so no question is needed."]);
  });

  it("is derived from the engine's own analysis: a fact that does change an outcome is not described this way", () => {
    const evaluation = evaluateDeal(profileFrom(), { merchant: deal.merchant, packages: deal.packages, templates: deal.templates });
    expect(evaluation.state).toBe("ambiguous");
    expect(uncapturedLines(evaluation)).toEqual([]);
  });

  it("is silent once the fact is confirmed", () => {
    expect(uncapturedLines(evaluateDeal(clarifiedHeroProfile(), { merchant: deal.merchant, packages: deal.packages, templates: deal.templates }))).toEqual([]);
  });
});

