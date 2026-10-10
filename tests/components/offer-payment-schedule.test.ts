import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OfferPaymentSchedule } from "@/components/offer/payment-schedule";

describe("offer payment schedule", () => {
  it("summarises equal monthly payments and keeps every exact date in a closed disclosure", () => {
    const payments = Array.from({ length: 12 }, (_, i) => ({ totalPaise: 1_180_000, dueDate: `${i < 8 ? 2027 : 2028}-${String((i + 4) % 12 + 1).padStart(2, "0")}-01` }));
    const html = renderToStaticMarkup(createElement(OfferPaymentSchedule, { payments }));
    expect(html).toContain("12 monthly payments of ₹11,800");
    expect(html).toContain("1 May 2027 – 1 Apr 2028");
    expect(html).toContain("View payment schedule");
    expect(html).not.toMatch(/<details[^>]*\bopen/);
    for (const payment of payments) expect(html.toLowerCase()).toContain(`datetime="${payment.dueDate}"`);
  });

  it("does not hide differing amounts caused by rounding", () => {
    const html = renderToStaticMarkup(createElement(OfferPaymentSchedule, { payments: [
      { totalPaise: 833337, dueDate: "2027-05-01" },
      { totalPaise: 833333, dueDate: "2027-06-01" },
      { totalPaise: 833333, dueDate: "2027-07-01" },
    ] }));
    expect(html).toContain("₹8,333.33–₹8,333.37 each");
  });

  it("does not describe an irregular schedule as monthly", () => {
    const html = renderToStaticMarkup(createElement(OfferPaymentSchedule, { payments: [
      { totalPaise: 100000, dueDate: "2027-05-01" },
      { totalPaise: 100000, dueDate: "2027-08-01" },
      { totalPaise: 100000, dueDate: "2027-12-01" },
    ] }));
    expect(html).toContain("3 payments of ₹1,000");
    expect(html).not.toContain("monthly");
  });
});
