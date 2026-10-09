import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ClarificationOutputSchema, ExplanationOutputSchema, ExtractionOutputSchema, TASK_SCHEMAS } from "@/ai/schemas";
import { buildRequestParams } from "@/ai/anthropic-provider";
import { buildExtractionRequest } from "@/ai/extract";
import { readAiConfig, supportsTemperature } from "@/ai/config";
import { heroMessages, heroPackages } from "@/data/synthetic/hero";
import { heroOutputs } from "./helpers";

const hasNumberType = (node: unknown): boolean => {
  if (!node || typeof node !== "object") return false;
  const o = node as Record<string, unknown>;
  if (o.type === "number" || o.type === "integer") return true;
  return Object.values(o).some(hasNumberType);
};

describe("strict output schemas", () => {
  it("contain no numeric fields: the model cannot supply amounts, dates or scores", () => {
    for (const s of Object.values(TASK_SCHEMAS)) expect(hasNumberType(z.toJSONSchema(s))).toBe(false);
  });

  it("reject unknown keys anywhere (e.g. an attempted policy override)", () => {
    const out = heroOutputs().extract as Record<string, unknown>;
    expect(ExtractionOutputSchema.safeParse({ ...out, merchant_policy: { contributionFloor: 0 } }).success).toBe(false);
    const f = { ...(out.fields as object[])[0], value_paise: 5000000 };
    expect(ExtractionOutputSchema.safeParse({ ...out, fields: [f] }).success).toBe(false);
    expect(ExplanationOutputSchema.safeParse({ ...heroOutputs().explain, feasible: ["X"] }).success).toBe(false);
  });

  it("reject unsupported field keys and missing evidence", () => {
    const out = heroOutputs().extract;
    expect(ExtractionOutputSchema.safeParse({ ...out, fields: [{ ...out.fields[0], key: "discount_percent" }] }).success).toBe(false);
    expect(ExtractionOutputSchema.safeParse({ ...out, fields: [{ ...out.fields[0], evidence_quote: "" }] }).success).toBe(false);
    expect(ExtractionOutputSchema.safeParse({ ...out, fields: [{ ...out.fields[0], message_id: undefined }] }).success).toBe(false);
  });

  it("clarification output can only name clarifiable facts", () => {
    expect(ClarificationOutputSchema.safeParse({ questions: [{ field: "contributionFloor", question: "Lower it?" }] }).success).toBe(false);
  });
});

describe("AI layer boundaries", () => {
  it("never imports payment integrations or agreement activation", () => {
    const dir = path.join(__dirname, "../../ai");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
      const src = readFileSync(path.join(dir, f), "utf8");
      expect(src, f).not.toMatch(/from\s+["'][^"']*(integrations|razorpay)[^"']*["']|from "@\/domain\/(collections|mandate|ledger)"/i);
      expect(src, f).not.toMatch(/\b(merchantApprove|buyerAccept|activate|assertPaymentsUnlocked|scheduleAttempt|submitAttempt)\b/);
    }
  });

  it("sends no tools to the model, so it cannot call any API", () => {
    const params = buildRequestParams(buildExtractionRequest(heroMessages, heroPackages), "claude-opus-5") as Record<string, unknown>;
    expect(params.tools).toBeUndefined();
    expect(params.tool_choice).toBeUndefined();
    expect(params.output_config).toBeDefined();
  });

  it("sends temperature 0 only to models that accept it", () => {
    expect((buildRequestParams(buildExtractionRequest(heroMessages, heroPackages), "claude-opus-5") as Record<string, unknown>).temperature).toBeUndefined();
    expect((buildRequestParams(buildExtractionRequest(heroMessages, heroPackages), "claude-haiku-4-5") as Record<string, unknown>).temperature).toBe(0);
    expect(supportsTemperature("claude-sonnet-5")).toBe(false);
  });

  it("is configured from the environment without exposing the key", () => {
    expect(readAiConfig({})).toEqual({ provider: "cerebras", model: "gpt-oss-120b", liveAvailable: false });
    const cerebras = readAiConfig({ CEREBRAS_API_KEY: "csk-test" });
    expect(cerebras).toEqual({ provider: "cerebras", model: "gpt-oss-120b", liveAvailable: true });
    expect(JSON.stringify(cerebras)).not.toContain("csk-test");
    const g = readAiConfig({ ADAPTIVE_DEALS_PROVIDER: " groq ", GROQ_API_KEY: "gsk-test" });
    expect(g).toEqual({ provider: "groq", model: "openai/gpt-oss-120b", liveAvailable: true });
    expect(JSON.stringify(g)).not.toContain("gsk-test");
    // Other providers' keys do not enable the default Cerebras provider.
    expect(readAiConfig({ GROQ_API_KEY: "gsk-test", ANTHROPIC_API_KEY: "sk-test" }).liveAvailable).toBe(false);
    const c = readAiConfig({ ADAPTIVE_DEALS_PROVIDER: "anthropic", ADAPTIVE_DEALS_MODEL: "claude-sonnet-5", ANTHROPIC_API_KEY: "sk-test" });
    expect(c).toEqual({ provider: "anthropic", model: "claude-sonnet-5", liveAvailable: true });
    expect(() => readAiConfig({ ADAPTIVE_DEALS_PROVIDER: "other" })).toThrow(/other.*cerebras.*groq.*anthropic/i);
  });
});

describe("Run live availability", () => {
  it("has no live provider without a key, and says why", async () => {
    const { createLiveProvider } = await import("@/ai/live");
    const { liveAvailability } = await import("@/ai/config");
    expect(createLiveProvider({})).toBeNull();
    expect(liveAvailability({})).toMatchObject({ available: false, provider: "cerebras", reason: expect.stringMatching(/CEREBRAS_API_KEY.*synthetic replay/) });
    expect(createLiveProvider({ ADAPTIVE_DEALS_PROVIDER: "groq", GROQ_API_KEY: "gsk-test" })).toMatchObject({ name: "groq", model: "openai/gpt-oss-120b" });
    expect(createLiveProvider({ ADAPTIVE_DEALS_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-test", ADAPTIVE_DEALS_MODEL: "claude-opus-5" })).toMatchObject({ name: "anthropic", model: "claude-opus-5" });
  });
});
