import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConversationThread } from "@/components/conversation-thread";
import { bundledSyntheticRun, seedState } from "@/lib/service";

const render = async (scope: "understand" | "track" = "understand") => {
  const s = await seedState(bundledSyntheticRun(), "replay");
  return { s, html: renderToStaticMarkup(ConversationThread({ s, scope, buyerName: "Kestrel Lane Clinics", opening: s.run.record.inputs.messages })) };
};

describe("the conversation reads as a chat", () => {
  it("carries one persistent 'WhatsApp (simulated)' label and no per-message repeats", async () => {
    const { html } = await render();
    expect(html.match(/WhatsApp \(simulated\)/g)).toHaveLength(1);
    expect(html).not.toMatch(/Simulated WhatsApp conversation|Simulated buyer reply|WhatsApp simulated/);
  });

  it("puts the buyer's bubbles on the left and the merchant's on the right", async () => {
    const { html } = await render();
    expect(html).toMatch(/data-testid="message-[^"]+"[^>]*data-side="left"/);
    expect(html).toMatch(/data-testid="message-[^"]+"[^>]*data-side="right"/);
  });

  it("highlights the phrases the buyer constraints came from, inside the bubble", async () => {
    const { html } = await render();
    expect(html).toContain('data-testid="chat-highlight"');
    expect(html.replace(/<[^>]+>/g, "")).toContain("I only have ₹50,000 left in this quarter");
  });

  it("shows an unsent draft in the composer area, not as a sent message", async () => {
    const { s, html } = await render();
    const draft = s.conversation.find((i) => i.direction === "outbound" && !i.sentAt);
    expect(draft).toBeTruthy();
    const composer = html.slice(html.indexOf('data-testid="chat-composer"'));
    expect(composer).toContain(`thread-${draft!.id}`);
    expect(composer).toContain("Not sent yet");
    expect(html.slice(0, html.indexOf('data-testid="chat-composer"'))).not.toContain(`thread-${draft!.id}`);
  });
});
