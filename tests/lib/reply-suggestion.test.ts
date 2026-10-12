import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ModelProvider, ProviderResult, StructuredRequest } from "@/ai/provider";
import { generateWithFallback } from "@/ai/live";
import { verifyReplyReading } from "@/lib/reply-reading";
import { driveTo } from "../helpers/drive";

process.env.ADAPTIVE_DEALS_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-suggest-"));
process.env.ADAPTIVE_DEALS_DEMO_RUN = "synthetic";

const meta = (provider: "cerebras" | "groq") => ({ provider, model: `${provider}-model`, temperature: "0" });
const fake = (name: "cerebras" | "groq", answer: () => Promise<ProviderResult>): ModelProvider => ({ name, model: `${name}-model`, generate: async (_: StructuredRequest) => answer() });
const ok = (name: "cerebras" | "groq", raw: unknown): (() => Promise<ProviderResult>) => async () => ({ ok: true, raw, meta: meta(name) });
const fail = (name: "cerebras" | "groq"): (() => Promise<ProviderResult>) => async () => ({ ok: false, failure: "api_error", message: "down", meta: meta(name) });
const req = { task: "read_reply", prompt: { task: "read_reply", version: "v", system: "" }, user: "x", schema: undefined, inputHash: "h" } as unknown as StructuredRequest;

describe("trying Cerebras, then Groq", () => {
  it("uses Cerebras when it answers, and never asks Groq", async () => {
    const groq = vi.fn(ok("groq", {}));
    const out = await generateWithFallback([fake("cerebras", ok("cerebras", { a: 1 })), fake("groq", groq)], req);
    expect(out.ok && out.result.meta.provider).toBe("cerebras");
    expect(groq).not.toHaveBeenCalled();
  });
  it("falls to Groq when Cerebras fails, throws, or is too slow", async () => {
    for (const first of [fail("cerebras"), async (): Promise<ProviderResult> => { throw new Error("network"); }, () => new Promise<ProviderResult>(() => undefined)]) {
      const out = await generateWithFallback([fake("cerebras", first), fake("groq", ok("groq", { a: 1 }))], req, 30);
      expect(out.ok && out.result.meta.provider).toBe("groq");
      expect(out.attempts.map((a) => a.provider)).toEqual(["cerebras", "groq"]);
    }
  });
  it("reports failure, without throwing, when none answers", async () => {
    const out = await generateWithFallback([fake("cerebras", fail("cerebras")), fake("groq", fail("groq"))], req);
    expect(out.ok).toBe(false);
    expect(out.attempts.map((a) => a.outcome)).toEqual(["failed", "failed"]);
    expect((await generateWithFallback([], req)).ok).toBe(false);
  });
});

describe("checking a model's reading of a reply", () => {
  const at = "2026-11-28T12:30:00+05:30";
  const reading = (over: Record<string, unknown> = {}) => ({ phrase: "20 tak", day_text: "20", month_text: null, direction: "until", ...over });
  it("accepts a quoted day, and works out the date in code", () => {
    const v = verifyReplyReading(reading(), "20 tak cash tight hai", at, "Asia/Kolkata");
    expect(v).toMatchObject({ ok: true, reading: { unavailableUntil: "2026-12-20", earliestDebit: "2026-12-21", direction: "until" } });
  });
  it("reads 'from' as the day before", () => {
    const v = verifyReplyReading(reading({ phrase: "20 se", direction: "from" }), "20 se pay kar dunga", at, "Asia/Kolkata");
    expect(v).toMatchObject({ ok: true, reading: { unavailableUntil: "2026-12-19", earliestDebit: "2026-12-20" } });
  });
  it("uses a named month, in the next year if it has passed", () => {
    expect(verifyReplyReading(reading({ phrase: "5 January", day_text: "5", month_text: "January" }), "can pay after 5 January", at, "Asia/Kolkata")).toMatchObject({ ok: true, reading: { unavailableUntil: "2027-01-05" } });
  });
  it("refuses a quote that is not in the reply, a quote without the day, an unclear direction, a bad day, and a far date", () => {
    const refuse = (raw: unknown, text: string) => expect(verifyReplyReading(raw, text, at, "Asia/Kolkata").ok).toBe(false);
    refuse(reading({ phrase: "25 tak" }), "20 tak cash tight hai");
    refuse(reading({ phrase: "tak" }), "20 tak cash tight hai");
    refuse(reading({ direction: "unclear" }), "20 tak cash tight hai");
    refuse(reading({ day_text: "30", month_text: "February", phrase: "30 Feb" }), "30 Feb tak");
    refuse(reading({ phrase: "5 March", day_text: "5", month_text: "March" }), "5 March tak");
    refuse({ phrase: "20 tak", day_text: "twenty", month_text: null, direction: "until" }, "20 tak");
  });
});

describe("the suggestion in the product", () => {
  type Svc = typeof import("@/lib/service");
  let svc: Svc;
  beforeAll(async () => { svc = await import("@/lib/service"); });
  afterAll(() => undefined);

  async function toUnclearReply(text: string) {
    await svc.resetToSeed();
    await driveTo(svc, (s) => s.conversation.some((x) => x.kind === "notice"));
    const notice = (await svc.getState()).conversation.find((x) => x.kind === "notice")!;
    const s = await svc.buyerReply({ inReplyTo: notice.id, text });
    return s.conversation.at(-1)!;
  }

  it("a reply the rules cannot read gets a pending suggestion that changes nothing until used", async () => {
    const reply = await toUnclearReply("20 tak cash tight hai");
    expect(reply.classification).toMatchObject({ kind: "needs_attention" });
    const before = await svc.getState();
    await svc.suggestReplyReading([fake("cerebras", fail("cerebras")), fake("groq", ok("groq", { phrase: "20 tak", day_text: "20", month_text: null, direction: "until" }))]);
    const s = await svc.getState();
    const sug = s.replySuggestions!.find((x) => x.messageId === reply.id)!;
    expect(sug).toMatchObject({ state: "pending", provider: "groq", unavailableUntil: "2026-12-20", earliestDebit: "2026-12-21" });
    expect(sug.attempts.map((a) => a.provider)).toEqual(["cerebras", "groq"]);
    expect(s.changeRequests).toEqual(before.changeRequests);
    expect(s.attempts).toEqual(before.attempts);
    expect(s.agreements).toEqual(before.agreements);
  });

  it("using it starts a change request exactly as a rule-read reply would, and a used suggestion cannot be used twice", async () => {
    const s = await svc.useReplySuggestion((await svc.getState()).replySuggestions![0].messageId);
    expect(s.changeRequests.at(-1)).toMatchObject({ state: "change_requested", unavailableUntil: "2026-12-20", earliestDebit: "2026-12-21" });
    expect(s.replySuggestions![0].state).toBe("used");
    await expect(svc.useReplySuggestion(s.replySuggestions![0].messageId)).rejects.toThrow(/no suggested reading/);
  });

  it("when no model answers, the reply is left for the merchant, and the failure is only in the log", async () => {
    const reply = await toUnclearReply("20 tak cash tight hai");
    await svc.suggestReplyReading([fake("cerebras", fail("cerebras")), fake("groq", fail("groq"))]);
    const s = await svc.getState();
    expect((s.replySuggestions ?? []).some((x) => x.messageId === reply.id)).toBe(false);
    expect(s.events.some((e) => e.kind === "reply_suggestion_none")).toBe(true);
  });

  it("a reply the rules can read is never sent to a model, and a made-up quote is never offered", async () => {
    const reply = await toUnclearReply("Cash is tight till the 20th.");
    const spy = vi.fn(ok("cerebras", { phrase: "20 tak", day_text: "20", month_text: null, direction: "until" }));
    await svc.suggestReplyReading([fake("cerebras", spy)]);
    expect(spy).not.toHaveBeenCalled();
    expect(reply.classification?.kind).toBe("change_requested");
    const odd = await toUnclearReply("20 tak cash tight hai");
    await svc.suggestReplyReading([fake("cerebras", ok("cerebras", { phrase: "30 tak", day_text: "30", month_text: null, direction: "until" }))]);
    expect(((await svc.getState()).replySuggestions ?? []).some((x) => x.messageId === odd.id)).toBe(false);
  });
});
