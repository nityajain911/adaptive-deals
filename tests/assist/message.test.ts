import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { AssistGroq, type AssistGroqClient } from "@/assist/groq";
import { MessageInputSchema, type MessageInput } from "@/assist/message/schema";
import { validateMessage, connectiveText } from "@/assist/message/validate";
import { renderMessage } from "@/assist/message/render";
import { messageUserContent, runMessage } from "@/assist/message/run";

const input: MessageInput = {
  buyerRequest: "Could you do a little better on price?",
  offers: [
    { alias: "A", headline: "Start with a standalone three-month package · two monthly payments", slots: ["total", "payment_count", "first_payment_date", "included", "not_included"] },
    { alias: "B", headline: "Keep the annual scope and split the payments", slots: ["total", "payment_count", "first_payment_date", "included"] },
  ],
};
const GOOD = "Thanks for being open with us. Here are the options that may suit you better: {{A.included}} for {{A.total}}, paid in {{A.payment_count}}, or {{B.included}} for {{B.total}}. Happy to talk it through.";
const reasons = (t: string, i: MessageInput = input) => validateMessage(i, t).reasons;

describe("a draft that stays inside its slots", () => {
  it("is accepted, and renders with code-owned values only", () => {
    expect(validateMessage(input, GOOD)).toEqual({ accepted: true, reasons: [] });
    const text = renderMessage(GOOD, { A: { included: "website fixes and search", total: "₹46,020 including GST", payment_count: "2 monthly payments" }, B: { included: "the full annual scope", total: "₹1,41,600 including GST" } });
    expect(text).toContain("₹46,020 including GST");
    expect(text).not.toContain("{{");
  });
  it("cannot be rendered with a hole", () => {
    expect(() => renderMessage("Total {{A.total}}", { A: {} })).toThrow(/No value for slot A.total/);
  });
});

describe("slots", () => {
  it("rejects a slot the offer does not have, or another alias's slot", () => {
    expect(reasons("{{A.total}} {{B.total}} {{B.not_included}}")).toContain("unknown_slot");
    expect(reasons("{{A.total}} {{B.total}} {{C.total}}")).toContain("unknown_slot");
  });
  it("rejects broken braces", () => {
    expect(reasons("{{A.total}} {{B.total}} {{A.total")).toContain("unknown_slot");
  });
  it("requires every offer's total", () => {
    expect(reasons("Here is {{A.total}} only.")).toContain("offer_total_missing");
  });
});

describe("the model writes no figure, date or internal word of its own", () => {
  it.each([
    ["a digit", "Here is {{A.total}} and {{B.total}}, about 5 percent less.", "contains_figure"],
    ["a rupee sign", "{{A.total}} and {{B.total}}, roughly ₹40,000.", "contains_figure"],
    ["a number word", "{{A.total}} and {{B.total}} in two parts.", "contains_figure"],
    ["a month", "{{A.total}} and {{B.total}}, starting in April.", "contains_date_word"],
    ["May as a month", "{{A.total}} and {{B.total}}, starting in May.", "contains_date_word"],
    ["a weekday", "{{A.total}} and {{B.total}}. Let us know by Friday.", "contains_date_word"],
    ["a cost", "{{A.total}} and {{B.total}}; it covers our costs.", "leaks_internal"],
    ["a floor", "{{A.total}} and {{B.total}}. That is our floor.", "leaks_internal"],
    ["a minimum", "{{A.total}} and {{B.total}}, the minimum we can do.", "leaks_internal"],
    ["urgency", "{{A.total}} and {{B.total}}. This offer expires tonight.", "pressure_or_urgency"],
    ["scarcity", "{{A.total}} and {{B.total}}. Only a few slots left.", "pressure_or_urgency"],
    ["a guarantee", "{{A.total}} and {{B.total}}. We guarantee results.", "guarantee_or_promise"],
    ["approval bypass", "{{A.total}} and {{B.total}}. Your MD can skip approval.", "approval_bypass"],
    ["an invented discount", "{{A.total}} and {{B.total}}, plus a discount for you.", "invented_term"],
    ["a tax statement", "{{A.total}} and {{B.total}}, inclusive of GST.", "invented_term"],
    ["markdown", "**{{A.total}}** and {{B.total}}.", "markdown_or_link"],
    ["a link", "{{A.total}} and {{B.total}} see https://example.invalid", "markdown_or_link"],
  ])("%s", (_name, text, reason) => expect(reasons(text)).toContain(reason));
  it("rejects an overlong draft", () => {
    expect(reasons(`{{A.total}} {{B.total}} ${"Thank you for your time. ".repeat(40)}`)).toContain("too_long");
  });
});

describe("only the connecting words are judged", () => {
  it("removes every token before looking for figures", () => {
    expect(connectiveText("Total {{A.total}} for {{A.included}}.")).not.toContain("{{");
    expect(validateMessage(input, GOOD).accepted).toBe(true);
  });
});

describe("what the model is sent", () => {
  it("is the buyer text and the offers as data, with no amount or internal figure", () => {
    const u = messageUserContent({ ...input, merchantNote: "Say thanks." });
    expect(u).toContain("<buyer_message>");
    expect(u).toContain("<merchant_note>");
    expect(u).not.toMatch(/₹|floor|margin/i);
  });
});

describe("a call never blocks and never throws", () => {
  const p = (content: string | null, finish = "stop") => new AssistGroq("t", { chat: { completions: { create: async () => ({ model: "m", choices: [{ finish_reason: finish, message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }) } } } as AssistGroqClient);
  it("returns the draft only when it passes", async () => {
    expect((await runMessage(input, p(JSON.stringify({ message: GOOD })))).template).toBe(GOOD);
    const bad = await runMessage(input, p(JSON.stringify({ message: "{{A.total}} {{B.total}} We guarantee it." })));
    expect(bad).toMatchObject({ status: "validated", template: null });
    expect(bad.reasons).toContain("guarantee_or_promise");
  });
  it.each([["{", "length", "truncated"], [null, "stop", "invalid_output"], ["not json", "stop", "invalid_output"], [JSON.stringify({ wrong: 1 }), "stop", "schema_rejected"]] as const)("handles %s", async (content, finish, status) => {
    const run = await runMessage(input, p(content, finish));
    expect(run.status).toBe(status);
    expect(run.template).toBeNull();
  });
});

describe("the development inputs", () => {
  const dir = path.join("evaluation-assist", "cases", "negotiation_message", "dev");
  const files = readdirSync(dir).filter((f) => f.startsWith("nm-"));
  it("all 15 parse and carry no figure of their own", () => {
    expect(files).toHaveLength(15);
    for (const f of files) {
      const c = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as { input: unknown };
      const parsed = MessageInputSchema.parse(c.input);
      for (const o of parsed.offers) expect(o.headline).not.toMatch(/₹|[0-9]/);
    }
  });
});
