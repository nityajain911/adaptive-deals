import { describe, expect, it } from "vitest";
import { profileFrom, clarifiedHeroProfile } from "../helpers";
import { originalProposalOf } from "@/lib/deal-context";
import { blockingLines, uncapturedLines } from "@/lib/understand-copy";
import { readFileSync } from "node:fs";
import { interpretExtraction } from "@/ai/extract";
import { recordedDeal } from "@/data/synthetic/recorded-conversations";
import { evaluateDeal } from "@/domain/engine";
import { heroBaseline } from "../helpers";

/** Spec §4: "What's blocking this deal", with GST basis and precision preserved. */
describe("blocking lines", () => {
  it("confirmed profile keeps the GST basis, quarter end, month precision and per-contract scope", () => {
    expect(blockingLines(clarifiedHeroProfile(), originalProposalOf(heroBaseline()))).toEqual([
      "Your quote: ₹1,41,600 including GST",
      "Their budget this quarter: ₹50,000 including GST, until 31 Dec 2026",
      "More budget from: April 2027",
      "Their MD must approve anything above ₹60,000 including GST, counted for the whole deal",
    ]);
  });
  it("marks unconfirmed facts inline instead of guessing", () => {
    const lines = blockingLines(profileFrom(), originalProposalOf(heroBaseline()));
    expect(lines[1]).toBe("Their budget this quarter: ₹50,000 (not clear if this includes GST), until 31 Dec 2026");
    expect(lines[3]).toBe("Their MD must approve anything above ₹60,000 (not clear if this includes GST); not clear if that is per payment or for the whole deal");
  });
  it("never implies a day for a month-precision budget or a live WhatsApp link", () => {
    const proposal = originalProposalOf(heroBaseline());
    const all = [...blockingLines(clarifiedHeroProfile(), proposal), ...blockingLines(profileFrom(), proposal)].join(" ");
    expect(all).not.toMatch(/1 Apr|via WhatsApp/);
  });
});

/** A fact the conversation did not state, which changes no structure's outcome, is disclosed rather than asked about. */
describe("facts not captured that change nothing", () => {
  // The real Groq extraction was made on the original conversation, so it is read against those messages.
  const deal = recordedDeal("preserve-scope");
  const input = { merchant: deal.merchant, packages: deal.packages, templates: deal.templates };
  const raw = (JSON.parse(readFileSync("tests/fixtures/preserve-scope-extract.json", "utf8")) as { rawOutput: unknown }).rawOutput;
  const profile = interpretExtraction(raw, { dealId: deal.dealId, messages: deal.messages, packages: deal.packages, timeZone: deal.merchant.timeZone }).profile;

  it("says the GST basis was not captured and that every structure has the same outcome either way", () => {
    const evaluation = evaluateDeal(profile, input);
    expect(evaluation.state).toBe("options_ready");
    expect(profile.amountsIncludeGst.status).toBe("ambiguous");
    expect(uncapturedLines(evaluation)).toEqual(["Whether GST is included was not mentioned. Every offer works either way, so we did not need to ask."]);
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
