import { describe, expect, it } from "vitest";
import { authorityStatement, CHANGE_STARTERS, proposalGlance, recurringStatement } from "@/lib/proposal-copy";

const view = {
  included: [{ name: "Website fixes" }, { name: "Search marketing" }, { name: "Monthly reporting" }],
  excluded: [{ name: "Social media" }],
  totalPaise: 4_602_000,
  payments: [{}, {}],
};

describe("the buyer's glance line", () => {
  it("states total, payment count and what is included, from the canonical view", () => {
    expect(proposalGlance(view as never)).toBe("₹46,020 including GST · 2 payments · Website fixes, Search marketing and Monthly reporting");
    expect(proposalGlance({ ...view, payments: [{}] } as never)).toContain("1 payment ·");
  });
});

describe("authority wording is built from the terms being accepted", () => {
  it("names the amount for approval above a limit, and keeps the verification disclosure separate", () => {
    const s = authorityStatement("required_approval", 14_160_000);
    expect(s.label).toBe("I confirm my company has approved this ₹1,41,600 deal.");
    expect(s.note).toBe("We can't check who approved it.");
  });
  it("names the amount for a standalone scope, and is silent when nothing is needed", () => {
    expect(authorityStatement("phase_scope", 4_602_000).label).toBe("I confirm I am allowed to buy this ₹46,020 package.");
    expect(authorityStatement(null, 1)).toEqual({ label: null, note: null });
  });
});

describe("recurring-payment wording", () => {
  const r = { perDebitLimitPaise: 2_301_000, endDate: "31 Dec 2026", debitCount: 1, noticeDays: 3 };
  it("describes collection on the scheduled dates only, and says a date moves only when both sides accept a revision", () => {
    const t = recurringStatement(r, "Pinecone Media Works");
    expect(t).toContain("You allow Pinecone Media Works to take the payments above automatically");
    expect(t).toContain("up to ₹23,010 each");
    expect(t).toContain("until 31 Dec 2026");
    expect(t).toContain("We remind you 3 days before each one");
    expect(t).toMatch(/only if you both agree to a new version/);
    expect(t).not.toMatch(/you can move|reschedule it yourself/i);
  });
});

describe("change-request starters", () => {
  it("offer a payment date, a scope, a lower price, or something else, and each carries its topic", () => {
    expect(CHANGE_STARTERS.map((x) => [x.id, x.label])).toEqual([["date", "A different payment date"], ["scope", "Change what's included"], ["price", "A lower price"], ["other", "Something else"]]);
    expect(JSON.stringify(CHANGE_STARTERS)).not.toMatch(/discount/i);
  });
});
