import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConversationThread } from "@/components/conversation-thread";
import { bundledSyntheticRun, seedState } from "@/lib/service";
import { heroMessages } from "@/data/synthetic/hero";
import { contextLine } from "@/components/offer/recommendation";
import { heroBaseline } from "../helpers";

describe("Understand conversation order", () => {
  it("shows the merchant proposal before the later buyer constraint in the collapsed thread", async () => {
    const state = await seedState(bundledSyntheticRun(), "replay");
    const html = renderToStaticMarkup(ConversationThread({ s: state, scope: "understand", buyerName: "Kestrel Lane Clinics", opening: heroMessages }));
    const merchant = html.indexOf("Sharing our annual proposal");
    const buyer = html.indexOf("Only ₹50K left this quarter");

    expect(merchant).toBeGreaterThan(-1);
    expect(buyer).toBeGreaterThan(merchant);
    expect(html.slice(0, Math.max(merchant, buyer))).not.toContain("Show full conversation");
  });

  it("describes the buyer amounts with the confirmed GST basis", () => {
    expect(contextLine(heroBaseline(), 5_000_000, 6_000_000, true, true)).toContain("including GST this quarter");
    expect(contextLine(heroBaseline(), 5_000_000, 6_000_000, true, false)).toContain("excluding GST this quarter");
    expect(contextLine(heroBaseline(), 5_000_000, 6_000_000, false, false)).toContain("Payments above ₹60,000 excluding GST");
  });
});

describe("clarification draft attribution in the thread", () => {
  it("labels hand-written sample drafts as samples, never as AI suggestions", async () => {
    const state = await seedState(bundledSyntheticRun(), "replay");
    expect(state.conversation.some((item) => item.state === "suggested_by_ai")).toBe(true);
    const html = renderToStaticMarkup(ConversationThread({ s: state, scope: "understand", buyerName: "Kestrel Lane Clinics", opening: state.run.record.inputs.messages }));
    expect(html).toContain("Sample wording written by hand");
    expect(html).not.toMatch(/Suggested by AI|Groq/);
  });

  it("keeps the AI label for drafts a recorded model produced", async () => {
    const { readFileSync } = await import("node:fs");
    const recorded = JSON.parse(readFileSync("data/live-runs/run-live-3f518779.json", "utf8"));
    const state = await seedState(recorded, "replay");
    const html = renderToStaticMarkup(ConversationThread({ s: state, scope: "understand", buyerName: "Kestrel Lane Clinics", opening: state.run.record.inputs.messages }));
    expect(html).toContain("Suggested by AI");
    expect(html).not.toContain("Sample wording written by hand");
  });
});
