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
    expect(s.label).toBe("I confirm the required internal approval for this ₹1,41,600 agreement has been obtained.");
    expect(s.note).toBe("Adaptive Deals does not verify who approved it.");
  });
  it("names the amount for a standalone scope, and is silent when nothing is needed", () => {
    expect(authorityStatement("phase_scope", 4_602_000).label).toBe("I confirm I am authorised to buy this standalone ₹46,020 package.");
    expect(authorityStatement(null, 1)).toEqual({ label: null, note: null });
  });
});

describe("recurring-payment wording", () => {
  const r = { perDebitLimitPaise: 2_301_000, endDate: "31 Dec 2026", debitCount: 1, noticeDays: 3 };
  it("describes collection on the scheduled dates only, and says a date moves only when both sides accept a revision", () => {
    const t = recurringStatement(r, "Pinecone Media Works");
    expect(t).toContain("You authorise Pinecone Media Works to collect the scheduled payments above");
    expect(t).toContain("each up to ₹23,010");
    expect(t).toContain("until 31 Dec 2026");
    expect(t).toContain("a reminder 3 days before");
    expect(t).toMatch(/only if you both accept a revised proposal/);
    expect(t).not.toMatch(/you can move|reschedule it yourself/i);
  });
});

describe("change-request starters", () => {
  it("offer a payment date, a scope, or something else, and never a different amount", () => {
    expect(CHANGE_STARTERS.map((x) => x.label)).toEqual(["A different payment date", "A different scope", "Something else"]);
    expect(JSON.stringify(CHANGE_STARTERS)).not.toMatch(/amount|price|discount/i);
  });
});
