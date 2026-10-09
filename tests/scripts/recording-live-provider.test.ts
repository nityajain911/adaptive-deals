import { describe, expect, it } from "vitest";
import { recordingProviderFromFreeze } from "@/scripts/recording-live-provider";

const freeze = { provider: "cerebras", model: "gpt-oss-120b" } as const;

describe("the provider used by an authorised case recording", () => {
  it("constructs the provider and model named by the freeze", () => {
    const live = recordingProviderFromFreeze(freeze, { CEREBRAS_API_KEY: "csk-test-only" });
    expect(live).toMatchObject({ name: "cerebras", model: "gpt-oss-120b" });
  });

  it("refuses missing credentials or a configured provider that differs from the freeze", () => {
    expect(() => recordingProviderFromFreeze(freeze, {})).toThrow(/CEREBRAS_API_KEY.*not set/i);
    expect(() => recordingProviderFromFreeze(freeze, { ADAPTIVE_DEALS_PROVIDER: "groq", GROQ_API_KEY: "gsk-test-only" })).toThrow(/freeze requires cerebras/i);
  });
});
