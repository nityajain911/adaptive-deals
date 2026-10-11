import { describe, expect, it } from "vitest";
import { describeChangeRequest, targetTotalIncludingGst, validateChangeRequest, type ChangeRequestContext } from "@/domain/change-request";

const ctx: ChangeRequestContext = {
  currentTotalPaise: 4_602_000,
  services: [
    { id: "website-fixes", name: "Website fixes" },
    { id: "search-marketing", name: "Search marketing" },
    { id: "social-media", name: "Social media" },
    { id: "monthly-reporting", name: "Monthly reporting" },
  ],
  includedIds: ["website-fixes", "search-marketing", "monthly-reporting"],
  lines: [
    { id: "pay-1", date: "2026-11-01", totalPaise: 2_301_000 },
    { id: "pay-2", date: "2026-12-01", totalPaise: 2_301_000 },
  ],
  today: "2026-10-01",
  gstRateBps: 1800,
};

describe("change requests", () => {
  it("builds the merchant's message from the structured request", () => {
    expect(describeChangeRequest({ kind: "price", targetPaise: 4_000_000, gstBasis: "including" }, "", ctx)).toBe("Could you do ₹40,000 including GST?");
    expect(describeChangeRequest({ kind: "price", targetPaise: 3_500_000, gstBasis: "excluding" }, "We can pay on time.", ctx)).toBe("Could you do ₹35,000 excluding GST? We can pay on time.");
    expect(describeChangeRequest({ kind: "scope", packageIds: ["website-fixes", "search-marketing"] }, "", ctx)).toBe("Could we change what's included to Website fixes and Search marketing?");
    expect(describeChangeRequest({ kind: "date", lineId: "pay-2", date: "2026-12-21" }, "", ctx)).toBe("Could the 1 Dec 2026 payment move to 21 Dec 2026?");
    expect(describeChangeRequest({ kind: "other" }, "  Can we talk?  ", ctx)).toBe("Can we talk?");
  });

  it("converts an amount before GST into the total the buyer would pay", () => {
    expect(targetTotalIncludingGst({ kind: "price", targetPaise: 3_500_000, gstBasis: "excluding" }, 1800)).toBe(4_130_000);
    expect(targetTotalIncludingGst({ kind: "price", targetPaise: 3_500_000, gstBasis: "including" }, 1800)).toBe(3_500_000);
  });

  it("accepts only a price that is lower once GST is counted", () => {
    expect(validateChangeRequest({ kind: "price", targetPaise: 4_000_000, gstBasis: "including" }, ctx)).toBeNull();
    expect(validateChangeRequest({ kind: "price", targetPaise: 4_000_000, gstBasis: "excluding" }, ctx)).toMatch(/lower than the current ₹46,020/);
    expect(validateChangeRequest({ kind: "price", targetPaise: 0, gstBasis: "including" }, ctx)).toMatch(/amount/);
    expect(validateChangeRequest({ kind: "price", targetPaise: 4_602_000, gstBasis: "including" }, ctx)).toMatch(/lower than/);
  });

  it("needs a real change to the services, from the services the merchant sells", () => {
    expect(validateChangeRequest({ kind: "scope", packageIds: ["website-fixes"] }, ctx)).toBeNull();
    expect(validateChangeRequest({ kind: "scope", packageIds: [] }, ctx)).toMatch(/at least one/);
    expect(validateChangeRequest({ kind: "scope", packageIds: ["podcast"] }, ctx)).toMatch(/not part of/);
    expect(validateChangeRequest({ kind: "scope", packageIds: ["monthly-reporting", "website-fixes", "search-marketing"] }, ctx)).toMatch(/Change at least one/);
  });

  it("needs one of the payments and a different future date", () => {
    expect(validateChangeRequest({ kind: "date", lineId: "pay-2", date: "2026-12-21" }, ctx)).toBeNull();
    expect(validateChangeRequest({ kind: "date", lineId: "nope", date: "2026-12-21" }, ctx)).toMatch(/which payment/);
    expect(validateChangeRequest({ kind: "date", lineId: "pay-2", date: "2026-09-30" }, ctx)).toMatch(/after today/);
    expect(validateChangeRequest({ kind: "date", lineId: "pay-2", date: "2026-12-01" }, ctx)).toMatch(/already the date/);
    expect(validateChangeRequest({ kind: "date", lineId: "pay-2", date: "2026-02-31" }, ctx)).toMatch(/valid date/);
  });
});
