import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RunRecord } from "@/ai/run-record";
import { demoCase, type CaseId } from "@/data/synthetic/cases";
import { heroPackages } from "@/data/synthetic/hero";
import { dealSituation } from "@/lib/deal-situation";

const NAMES = Object.fromEntries(heroPackages.map((pkg) => [pkg.id, pkg.name]));
const RUNS: Record<CaseId, string> = { "reduced-scope": "run-case-reduced-scope-ed5442a3", "preserve-scope": "run-case-preserve-scope-1ec088fa", "no-fit": "run-case-no-fit-6fb4027d" };
const tiles = (id: CaseId) => {
  const run = JSON.parse(readFileSync(`data/case-recorded-runs/${RUNS[id]}.json`, "utf8")) as RunRecord;
  const t = dealSituation({ quotePrePaise: demoCase(id)!.quote.prePaise, profile: run.engine.profile, rejectedFields: run.engine.rejectedFields, packageNames: NAMES });
  return Object.fromEntries(t.map((tile) => [tile.id, tile]));
};

describe("a buyer's situation as scannable facts", () => {
  it("reduced scope: the budget is short of the quote, no start date was stated, and the scope is named", () => {
    const t = tiles("reduced-scope");
    expect(t.budget).toMatchObject({ value: "Short of your quote", tone: "red", detail: "₹50,000 available now · more from Apr 2027", quote: "I only have ₹50,000 left in this quarter." });
    expect(t.timeline).toMatchObject({ value: "No start date stated", tone: "neutral", quote: null });
    expect(t.scope).toMatchObject({ value: "Website fixes, Search marketing", tone: "neutral" });
    expect(t.approval!.value).toBe("Above ₹60,000 needs MD approval");
  });

  it("preserve scope: a short budget, a start that can wait, and services the merchant must confirm", () => {
    const t = tiles("preserve-scope");
    expect(t.budget).toMatchObject({ value: "Short of your quote", tone: "red", detail: "₹10,000 available now · more from 1 May 2027" });
    expect(t.timeline).toMatchObject({ value: "Start can wait a while", tone: "amber", detail: "Start by 1 May 2027" });
    expect(t.scope).toMatchObject({ value: "Services to confirm", tone: "amber" });
    expect(t.scope!.detail).toBe("They said “complete annual package” without naming services");
  });

  it("no fit: the money is there, but the start is too soon", () => {
    const t = tiles("no-fit");
    expect(t.budget).toMatchObject({ value: "Covers your quote", tone: "green" });
    expect(t.timeline).toMatchObject({ value: "Needs a fast start", tone: "red", detail: "Start by 15 Oct 2026" });
  });

  it("says 'not stated' for what the buyer did not say, and invents nothing", () => {
    const blank = dealSituation({ quotePrePaise: 12_000_000, profile: [], rejectedFields: [], packageNames: NAMES });
    expect(blank.map((tile) => [tile.id, tile.value, tile.tone])).toEqual([["budget", "Not stated", "neutral"], ["timeline", "No start date stated", "neutral"], ["scope", "Not stated", "neutral"]]);
  });

  it("every quote shown is the buyer's own words, found in the conversation", () => {
    for (const id of Object.keys(RUNS) as CaseId[]) {
      const text = demoCase(id)!.deal.messages.map((message) => message.text).join("\n");
      for (const tile of Object.values(tiles(id))) if (tile.quote) expect(text, `${id} ${tile.id}`).toContain(tile.quote.replace(/\.$/, ""));
    }
  });
});
