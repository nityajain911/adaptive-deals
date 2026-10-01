import { z } from "zod";

/**
 * Convert a Zod schema to the JSON Schema subset accepted by strict structured-output modes
 * (Groq strict mode): every object closed and fully required, and only basic keywords kept.
 * Length and count limits are dropped here and enforced by Zod on the response instead.
 */
const KEEP = new Set(["type", "properties", "required", "additionalProperties", "items", "enum", "anyOf", "description", "const"]);

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (!KEEP.has(k)) continue;
    out[k] = k === "properties" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [pk, clean(pv)])) : clean(v);
  }
  if (out.type === "object") {
    out.additionalProperties = false;
    out.required = Object.keys((out.properties as Record<string, unknown>) ?? {});
  }
  return out;
}

export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return clean(z.toJSONSchema(schema)) as Record<string, unknown>;
}
