import { describe, expect, it } from "vitest";
import { checkText, interpretExplanation } from "@/ai/explain";
import { PROMPTS, PROMPT_VERSIONS } from "@/ai/prompts";
import { AliasSchema, ExplanationOutputSchema, ExplanationOutputSchemaV1, explanationSchemaFor } from "@/ai/schemas";
import { toStrictJsonSchema } from "@/ai/strict-schema";
import { evaluateDeal } from "@/domain/engine";
import { clarifiedHeroProfile, heroInput } from "../helpers";

const feasible = evaluateDeal(clarifiedHeroProfile(), heroInput()).result!.feasible;
const prose = "Option {A.label} costs {A.total} and is {A.approval}; {B.label} is paid on {B.payment_1.date}.";
const out = (ranking: string[], notes: { option: string; note: string }[] = []) => ({ ranking, comparison: prose, option_notes: notes });

describe("explain.v3 schema: bare aliases in identifier fields", () => {
  it("accepts bare aliases", () => {
    expect(ExplanationOutputSchema.safeParse(out(["A", "B"])).success).toBe(true);
    expect(AliasSchema.options).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]);
  });
  it("rejects placeholders or labels in ranking", () => {
    expect(ExplanationOutputSchema.safeParse(out(["{A.label}", "{B.label}"])).success).toBe(false);
    expect(ExplanationOutputSchema.safeParse(out(["Option A"])).success).toBe(false);
  });
  it("rejects a placeholder as option_notes[].option", () => {
    expect(ExplanationOutputSchema.safeParse(out(["A"], [{ option: "{A.label}", note: "Smaller payments for the buyer." }])).success).toBe(false);
    expect(ExplanationOutputSchema.safeParse(out(["A"], [{ option: "A", note: "Smaller payments for the buyer." }])).success).toBe(true);
  });
  it("is enforced as an enum in the strict JSON schema sent to the provider", () => {
    const js = toStrictJsonSchema(ExplanationOutputSchema) as { properties: { ranking: { items: { enum: string[] } } } };
    expect(js.properties.ranking.items.enum).toEqual([...AliasSchema.options]);
  });
  it("earlier prompt versions keep their original schema, so their runs replay exactly", () => {
    expect(explanationSchemaFor("explain.v1")).toBe(ExplanationOutputSchemaV1);
    expect(explanationSchemaFor("explain.v2")).toBe(ExplanationOutputSchemaV1);
    expect(explanationSchemaFor("explain.v3")).toBe(ExplanationOutputSchema);
    expect(Object.keys(PROMPT_VERSIONS).filter((v) => v.startsWith("explain"))).toEqual(expect.arrayContaining(["explain.v1", "explain.v2", "explain.v3"]));
    expect(PROMPTS.explain.version).toBe("explain.v3");
  });
});

describe("explain.v3 prose guards (validators unchanged)", () => {
  const options = interpretExplanation(null, feasible).options;
  it("prose using {A.label}, {A.total} and {A.approval} passes", () => {
    expect(checkText(prose, options)).toBeNull();
    const r = interpretExplanation(out(["A", "B", "C", "D"], [{ option: "A", note: "Within {A.approval}, paid in {A.payment_count} parts." }]), feasible);
    expect(r.source).toEqual({ ranking: "ai", text: "ai" });
    expect(r.issues).toEqual([]);
  });
  it("literal figures and approval-avoidance wording still fail", () => {
    expect(checkText("Option A costs ₹46,020.", options)).toMatch(/literal figure/);
    expect(checkText("{C.label} puts 30% down.", options)).toMatch(/literal figure/);
    expect(checkText("{A.label} and {B.label} avoid MD approval.", options)).toMatch(/avoiding approval/);
    expect(checkText("Choose {A.label} to stay under the limit.", options)).toMatch(/avoiding approval/);
  });
});

describe("explain.v3 alias corrections by code", () => {
  it("removes duplicates, ignores unavailable aliases, appends omissions and enforces approval order", () => {
    const r = interpretExplanation(out(["D", "D", "E", "A"]), feasible);
    expect(r.order).toHaveLength(feasible.length);
    expect(new Set(r.order).size).toBe(feasible.length);
    expect(r.order.slice(0, 2).every((id) => feasible.find((x) => x.structure.id === id)!.approval === "within_limit")).toBe(true);
    expect(r.issues.join(" | ")).toMatch(/did not mark feasible \(E\)/);
    expect(r.issues.join(" | ")).toMatch(/duplicates removed/);
    expect(r.issues.join(" | ")).toMatch(/omitted feasible options/);
    expect(r.issues.join(" | ")).toMatch(/approval ordering enforced/);
  });
  it("a schema-invalid output is replaced wholesale by code ranking and code wording", () => {
    const r = interpretExplanation(out(["{A.label}", "{B.label}"]), feasible);
    expect(r.source).toEqual({ ranking: "code", text: "code_fallback" });
    expect(r.order).toEqual(feasible.map((x) => x.structure.id));
  });
});
