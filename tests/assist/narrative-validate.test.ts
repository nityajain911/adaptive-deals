import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { validateNarrative } from "@/assist/narrative/validate";
import { NarrativeInputSchema, type NarrativeInput, type NarrativeOutput } from "@/assist/narrative/schema";

const input = (...offers: string[][]): NarrativeInput => ({ strategy: "protect_contribution", offers: offers.map((factIds, i) => ({ alias: String.fromCharCode(65 + i), factIds })) });
const out = (...offers: [string[], string][]): NarrativeOutput => ({ offers: offers.map(([fact_ids, sentence], i) => ({ alias: String.fromCharCode(65 + i), fact_ids, sentence })) });
const verdict = (i: NarrativeInput, o: NarrativeOutput) => validateNarrative(i, o)[0]!;

const KEEPS = ["highest_contribution", "within_buyer_approval", "no_discount"];

describe("a sentence that says only what its cited facts support", () => {
  it("is accepted", () => {
    const v = verdict(input(KEEPS), out([["highest_contribution", "within_buyer_approval"], "It keeps the most for you and stays within what the buyer can approve."]));
    expect(v).toMatchObject({ accepted: true, reasons: [] });
  });
  it("is accepted when it makes no comparison at all", () => {
    expect(verdict(input(KEEPS), out([["within_buyer_approval"], "The buyer can approve this offer without involving their MD."])).accepted).toBe(true);
  });
});

describe("figures are never accepted", () => {
  it.each([
    ["digits", "It keeps the most and splits into 2 payments."],
    ["rupee sign", "It keeps the most, about ₹19,000."],
    ["a percentage", "It keeps the most with a 5% discount."],
    ["currency words", "It keeps the most rupees for you."],
    ["number words", "It keeps the most across two payments."],
    ["magnitudes", "It keeps the most, around a lakh."],
  ])("%s", (_name, sentence) => {
    expect(verdict(input(KEEPS), out([["highest_contribution"], sentence])).reasons).toContain("contains_figure");
  });
});

describe("facts must be true for that offer", () => {
  it("rejects a fact the offer does not have", () => {
    expect(verdict(input(["within_buyer_approval"]), out([["highest_contribution"], "It keeps the most for you."])).reasons).toContain("fact_not_true_for_offer");
  });
  it("rejects a comparative whose only justification is a fact the offer lacks", () => {
    expect(verdict(input(["within_buyer_approval"]), out([["highest_contribution", "within_buyer_approval"], "It keeps the most for you."])).accepted).toBe(false);
  });
  it("rejects a fact that belongs to another offer", () => {
    const i = input(["highest_contribution"], ["lowest_total"]);
    const v = validateNarrative(i, out([["lowest_total"], "It has the lowest total."], [["lowest_total"], "It has the lowest total."]));
    expect(v[0]!.reasons).toContain("fact_not_true_for_offer");
    expect(v[1]!.accepted).toBe(true);
  });
});

describe("comparatives and topics need the facts that justify them", () => {
  it("rejects a comparative with no extremum fact", () => {
    expect(verdict(input(KEEPS), out([["within_buyer_approval"], "The buyer can approve this with fewer steps."])).reasons).toContain("comparative_without_extremum_fact");
  });
  it("rejects a topic that no cited fact covers", () => {
    expect(verdict(input(KEEPS), out([["within_buyer_approval"], "It protects your cash."])).reasons).toContain("topic_without_fact");
  });
  it("accepts a topic that a cited fact covers", () => {
    expect(verdict(input(["lowest_cash_exposure", "no_discount"]), out([["lowest_cash_exposure"], "It ties up the least of your cash."])).accepted).toBe(true);
  });
});

describe("ties must be stated as ties", () => {
  const tied = ["highest_contribution", "tied_on:contribution", "within_buyer_approval"];
  it("rejects a sole claim over a tied fact", () => {
    expect(verdict(input(tied), out([["highest_contribution"], "It keeps the most for you."])).reasons).toContain("tie_not_stated");
  });
  it("accepts a sentence that says it is tied", () => {
    expect(verdict(input(tied), out([["highest_contribution", "tied_on:contribution"], "It keeps as much as the other leading offer."])).accepted).toBe(true);
  });
});

describe("approval claims match the facts", () => {
  it("rejects 'needs approval' when the offer is within the limit", () => {
    expect(verdict(input(KEEPS), out([["within_buyer_approval"], "The buyer needs their MD approval for this one."])).reasons).toContain("approval_claim_mismatch");
  });
  it("rejects 'within approval' when the offer needs it", () => {
    expect(verdict(input(["needs_buyer_approval"]), out([["needs_buyer_approval"], "It stays within the buyer's approval."])).reasons).toContain("approval_claim_mismatch");
  });
  it("accepts the right claim", () => {
    expect(verdict(input(["needs_buyer_approval"]), out([["needs_buyer_approval"], "The buyer needs their MD approval for this offer."])).accepted).toBe(true);
  });
});

describe("wording the model must never use", () => {
  it.each([
    ["a ranking verdict", "This is the best option for you."],
    ["a recommendation", "We recommend this one."],
    ["a cost", "It covers your costs with room to spare."],
    ["a margin or floor", "It stays above your floor."],
    ["urgency", "Send this now before the buyer changes their mind."],
    ["a guarantee", "It guarantees the buyer will accept."],
    ["negotiation tactics", "Use this to negotiate harder."],
  ])("%s", (_name, sentence) => {
    expect(verdict(input(KEEPS), out([["within_buyer_approval"], sentence])).reasons).toContain("banned_wording");
  });
});

describe("shape", () => {
  it("rejects more than one sentence", () => {
    expect(verdict(input(KEEPS), out([["within_buyer_approval"], "The buyer can approve it. It is simple."])).reasons).toContain("not_one_sentence");
  });
  it("rejects markdown and line breaks", () => {
    expect(verdict(input(KEEPS), out([["within_buyer_approval"], "**The buyer** can approve it."])).reasons).toContain("not_one_sentence");
    expect(verdict(input(KEEPS), out([["within_buyer_approval"], "The buyer can approve it.\nSecond line."])).reasons).toContain("not_one_sentence");
  });
  it("rejects a sentence over the length limit", () => {
    expect(verdict(input(KEEPS), out([["within_buyer_approval"], `The buyer can approve ${"this offer and ".repeat(20)}easily.`])).reasons).toContain("too_long");
  });
  it("rejects a sentence with no terminal stop", () => {
    expect(verdict(input(KEEPS), out([["within_buyer_approval"], "The buyer can approve this offer"])).reasons).toContain("not_one_sentence");
  });
});

describe("aliases", () => {
  it("marks a missing alias, a duplicate and an unknown alias, and never throws", () => {
    const i = input(KEEPS, ["lowest_total"]);
    const v = validateNarrative(i, { offers: [{ alias: "A", fact_ids: ["within_buyer_approval"], sentence: "The buyer can approve it." }, { alias: "A", fact_ids: ["within_buyer_approval"], sentence: "The buyer can approve it." }, { alias: "Z", fact_ids: ["lowest_total"], sentence: "It has the lowest total." }] });
    expect(v.find((x) => x.alias === "B")!.reasons).toEqual(["missing_alias"]);
    expect(v.filter((x) => x.reasons.includes("duplicate_alias"))).toHaveLength(1);
    expect(v.find((x) => x.alias === "Z")!.reasons).toEqual(["unknown_alias"]);
  });
  it("judges each offer on its own", () => {
    const i = input(KEEPS, ["lowest_total", "within_buyer_approval"]);
    const v = validateNarrative(i, out([["within_buyer_approval"], "This is the best option."], [["lowest_total", "within_buyer_approval"], "It has the lowest total and stays within what the buyer can approve."]));
    expect(v.map((x) => x.accepted)).toEqual([false, true]);
  });
});

describe("the development inputs", () => {
  const dir = path.join("evaluation-assist", "cases", "strategy_narrative", "dev");
  const files = readdirSync(dir).filter((f) => f.startsWith("ns-"));
  it("all parse against the input schema, with no figure-bearing fact", () => {
    expect(files).toHaveLength(24);
    for (const f of files) {
      const parsed = NarrativeInputSchema.parse(JSON.parse(readFileSync(path.join(dir, f), "utf8")).input);
      expect(JSON.stringify(parsed)).not.toMatch(/[0-9]|₹/);
    }
  });
  it("no sentence built only from a cited fact's own words is rejected for a true fact", () => {
    // A clean sentence per extremum fact must pass, so the validator is not rejecting honest wording.
    const phrase: Record<string, string> = {
      highest_contribution: "It keeps the most for you.",
      lowest_cash_exposure: "It ties up the least of your cash.",
      most_scope_retained: "It retains the most of the full package.",
      smallest_largest_payment: "It has the smallest largest payment.",
      lowest_total: "It has the lowest total.",
      earliest_start: "It has the earliest start.",
    };
    for (const [fact, sentence] of Object.entries(phrase)) expect(verdict(input([fact]), out([[fact], sentence])), fact).toMatchObject({ accepted: true });
  });
});
