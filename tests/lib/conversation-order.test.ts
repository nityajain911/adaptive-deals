import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConversationThread } from "@/components/conversation-thread";
import { bundledSyntheticRun, seedState } from "@/lib/service";
import { heroMessages } from "@/data/synthetic/hero";
import { contextLine } from "@/components/offer/recommendation";

describe("Understand conversation order", () => {
  it("shows the merchant proposal before the later buyer constraint in the collapsed thread", async () => {
    const state = await seedState(bundledSyntheticRun(), "replay");
    const html = renderToStaticMarkup(ConversationThread({ s: state, scope: "understand", opening: heroMessages }));
    const merchant = html.indexOf("Sharing our annual proposal");
    const buyer = html.indexOf("Only ₹50K left this quarter");

    expect(merchant).toBeGreaterThan(-1);
    expect(buyer).toBeGreaterThan(merchant);
    expect(html.slice(0, Math.max(merchant, buyer))).not.toContain("Show full conversation");
  });

  it("describes the buyer amounts with the confirmed GST basis", () => {
    expect(contextLine(5_000_000, 6_000_000, true, true)).toContain("including GST this quarter");
    expect(contextLine(5_000_000, 6_000_000, true, false)).toContain("excluding GST this quarter");
    expect(contextLine(5_000_000, 6_000_000, false, false)).toContain("Payments above ₹60,000 excluding GST");
  });
});
