import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RunRecord } from "@/ai/run-record";
import { demoCase, type CaseId } from "@/data/synthetic/cases";
import { heroPackages } from "@/data/synthetic/hero";
import { dealSituation } from "@/lib/deal-situation";

const NAMES = Object.fromEntries(heroPackages.map((pkg) => [pkg.id, pkg.name]));
const RUNS: Record<CaseId, string> = { "reduced-scope": "data/case-recorded-runs/run-case-reduced-scope-4e94d36d.json", "preserve-scope": "data/case-recorded-runs/run-case-preserve-scope-9fe9e42b.json", "no-fit": "data/synthetic/replay/no-fit-synthetic-run.json" };
const tiles = (id: CaseId) => {
  const run = JSON.parse(readFileSync(RUNS[id], "utf8")) as RunRecord;
  const t = dealSituation({ quotePrePaise: demoCase(id)!.quote.prePaise, profile: run.engine.profile, rejectedFields: run.engine.rejectedFields, packageNames: NAMES });
  return Object.fromEntries(t.map((tile) => [tile.id, tile]));
};

describe("a buyer's situation as scannable facts", () => {
  it("reduced scope: the budget is short of the quote, no start date was stated, and the scope is named", () => {
    const t = tiles("reduced-scope");
    expect(t.budget).toMatchObject({ value: "Short of your quote", tone: "red", detail: "₹50,000 available now · more from Jan 2027", quote: "I only have ₹50,000 left in this quarter." });
    expect(t.timeline).toMatchObject({ value: "No start date stated", tone: "neutral", quote: null });
    expect(t.scope).toMatchObject({ value: "Website fixes, Search marketing", tone: "neutral" });
    expect(t.approval!.value).toBe("Above ₹60,000 needs MD approval");
  });

  it("discount ask: a short budget, no start date, the services they need named and reporting able to wait", () => {
    const t = tiles("preserve-scope");
    expect(t.budget).toMatchObject({ value: "Short of your quote", tone: "red", detail: "₹30,000 available now · more from 1 Jan 2027" });
    expect(t.timeline).toMatchObject({ value: "No start date stated", tone: "neutral" });
    expect(t.scope).toMatchObject({ value: "Website fixes, Search marketing", tone: "neutral" });
    expect(t.approval!.value).toBe("Above ₹75,000 needs MD approval");
  });

  it("cheaper quote: a budget short of the quote, no start date, and all four services needed", () => {
    const t = tiles("no-fit");
    expect(t.budget).toMatchObject({ value: "Short of your quote", tone: "red", detail: "₹80,000 available now" });
    expect(t.timeline).toMatchObject({ value: "No start date stated", tone: "neutral" });
    expect(t.scope).toMatchObject({ value: "Website fixes, Search marketing, Social media, Monthly reporting", tone: "neutral" });
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
