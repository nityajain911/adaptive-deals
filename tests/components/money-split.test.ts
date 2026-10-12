import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { MoneySplit } from "@/components/offer/money-split";

const render = (p: { gstPaise: number; costsPaise: number; feesPaise: number; keepPaise: number }) => renderToStaticMarkup(createElement(MoneySplit, p));
const widths = (html: string) => [...html.matchAll(/class="money-split-segment ([^"]+)" style="width:([\d.]+)%/g)].map((m) => [m[1].replace("bg-", ""), Number(m[2])] as const);

describe("the money split", () => {
  it("a profitable deal splits the buyer's money into what you keep, costs, fees and GST, and shows no loss", () => {
    const html = render({ gstPaise: 702_000, costsPaise: 1_875_000, feesPaise: 92_040, keepPaise: 1_932_960 });
    const parts = widths(html);
    expect(parts.map(([c]) => c)).toEqual(["green", "coral", "amber", "line-strong"]);
    expect(parts.reduce((n, [, w]) => n + w, 0)).toBeCloseTo(100, 5);
    expect(html).not.toContain("You lose");
    expect(html).not.toContain("bg-red");
    expect(html).not.toContain("data-loss");
  });

  it("a losing deal draws the part of the costs the price does not cover in red, and keeps the bar whole", () => {
    // Price ₹10,000 + GST ₹1,800 against ₹14,000 of costs and ₹500 of fees: a ₹4,500 loss.
    const html = render({ gstPaise: 180_000, costsPaise: 1_400_000, feesPaise: 50_000, keepPaise: -450_000 });
    const parts = widths(html);
    expect(parts.map(([c]) => c)).toEqual(["line-strong", "coral", "amber", "red"]);
    expect(parts.reduce((n, [, w]) => n + w, 0)).toBeCloseTo(100, 5);
    // The red part is the loss's share of everything the business pays out.
    const red = parts.find(([c]) => c === "red")![1];
    expect(red).toBeCloseTo((450_000 / (180_000 + 1_400_000 + 50_000)) * 100, 1);
    expect(html).toContain('data-loss="true"');
    expect(html).toContain("You lose");
    expect(html).toContain("₹4,500");
    expect(html).toContain("short of your delivery costs and fees");
    expect(html).not.toContain("You keep");
  });

  it("a loss larger than the fees is taken from the costs as well, so the legend still lists every full amount", () => {
    const html = render({ gstPaise: 0, costsPaise: 1_000_000, feesPaise: 10_000, keepPaise: -300_000 });
    const parts = widths(html);
    expect(parts.reduce((n, [, w]) => n + w, 0)).toBeCloseTo(100, 5);
    expect(parts.find(([c]) => c === "amber")![1]).toBe(0);
    expect(html).toContain("₹10,000");
    expect(html).toContain("₹100");
  });
});
