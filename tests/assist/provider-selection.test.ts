import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createLiveAssistProvider } from "@/assist/live";
import type { AssistProvider } from "@/assist/provider";
import { runProfile } from "@/assist/profile/run";

describe("provider-neutral assist generation", () => {
  it("lets task runners consume the contract instead of a Groq class", async () => {
    const provider: AssistProvider = {
      name: "cerebras",
      model: "fixture",
      generate: async () => ({ ok: true, raw: { services: [], suspected_instructions: [] }, meta: { provider: "cerebras", model: "fixture", stopReason: "stop", usage: null } }),
    };
    const run = await runProfile({ kind: "text", source: "No priced services." }, provider);
    expect(run).toMatchObject({ status: "verified", meta: { provider: "cerebras", model: "fixture" } });
  });

  it("selects only the configured provider and its credential", () => {
    expect(createLiveAssistProvider({})).toBeNull();
    expect(createLiveAssistProvider({ CEREBRAS_API_KEY: "csk-test" })).toMatchObject({ name: "cerebras", model: "gpt-oss-120b" });
    expect(createLiveAssistProvider({ ADAPTIVE_DEALS_PROVIDER: "groq", GROQ_API_KEY: "gsk-test", CEREBRAS_API_KEY: "unused" })).toMatchObject({ name: "groq", model: "openai/gpt-oss-120b" });
    expect(createLiveAssistProvider({ ADAPTIVE_DEALS_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-test", CEREBRAS_API_KEY: "unused" })).toMatchObject({ name: "anthropic", model: "claude-opus-5" });
    expect(createLiveAssistProvider({ ADAPTIVE_DEALS_PROVIDER: "groq", CEREBRAS_API_KEY: "wrong-provider" })).toBeNull();
  });

  it("keeps the neutral request limited to structured text generation", async () => {
    let received: unknown;
    const provider: AssistProvider = {
      name: "groq",
      model: "fixture",
      generate: async (request) => {
        received = request;
        return { ok: false, failure: "invalid_output", message: "fixture", meta: null };
      },
    };
    await provider.generate({ system: "s", user: "u", name: "n", schema: z.object({ ok: z.boolean() }) });
    expect(received).toEqual({ system: "s", user: "u", name: "n", schema: expect.anything() });
    expect(received).not.toHaveProperty("tools");
  });
});
