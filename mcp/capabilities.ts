import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "@/domain/agreement";
import type { McpCapabilityBinding, McpToolCatalog } from "./types";

const jsonSchema = z.object({
  type: z.literal("object"),
  properties: z.record(z.string(), z.unknown()),
  required: z.array(z.string()),
  additionalProperties: z.boolean().optional(),
}).passthrough();

const toolSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  metadata: z.object({
    provider: z.literal("razorpay"),
    environment: z.enum(["test", "live"]),
    capability: z.string().min(1),
  }).strict(),
  inputSchema: jsonSchema,
  outputSchema: jsonSchema.optional(),
}).strict();

const catalogSchema = z.object({
  serverId: z.string().min(1),
  serverVersion: z.string().min(1).nullable(),
  mode: z.string().min(1),
  tools: z.array(z.unknown()),
}).strict();

const sha = (value: unknown) => createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
export const catalogHash = (catalog: McpToolCatalog): string => sha(catalog);

type CapabilityResult = {
  status: "compatible" | "unsupported" | "refused" | "malformed";
  catalogHash: string | null;
  reason: string;
  bindings: { createTestPaymentLink?: McpCapabilityBinding; fetchPaymentLink?: McpCapabilityBinding };
};

const hasRequired = (schema: z.infer<typeof jsonSchema>, names: string[]) => names.every((name) => schema.required.includes(name) && name in schema.properties);

export function bindRazorpayCapabilities(input: unknown, discoveredAt = "2026-10-08T12:00:00+05:30"): CapabilityResult {
  const parsedCatalog = catalogSchema.safeParse(input);
  if (!parsedCatalog.success) return { status: "malformed", catalogHash: null, reason: "The MCP catalog is malformed", bindings: {} };
  const hash = catalogHash(parsedCatalog.data);
  const parsedTools = parsedCatalog.data.tools.map((tool) => toolSchema.safeParse(tool));
  if (parsedTools.some((tool) => !tool.success)) return { status: "malformed", catalogHash: hash, reason: "At least one advertised MCP tool is malformed", bindings: {} };
  if (parsedCatalog.data.mode !== "test" || parsedTools.some((tool) => tool.success && tool.data.metadata.environment !== "test")) {
    return { status: "refused", catalogHash: hash, reason: "Only a Razorpay test mode catalog may be used", bindings: {} };
  }
  const tools = parsedTools.flatMap((tool) => tool.success ? [tool.data] : []);
  const create = tools.find((tool) => tool.metadata.capability === "create_payment_link" && hasRequired(tool.inputSchema, ["amount", "currency", "description", "reference", "idempotency_key"]) && !!tool.outputSchema && hasRequired(tool.outputSchema, ["id", "short_url", "status"]));
  if (!create) return { status: "unsupported", catalogHash: hash, reason: "No compatible test Payment Link capability was advertised", bindings: {} };
  return {
    status: "compatible",
    catalogHash: hash,
    reason: "Compatible Razorpay test Payment Link capability advertised",
    bindings: { createTestPaymentLink: { serverId: parsedCatalog.data.serverId, serverVersion: parsedCatalog.data.serverVersion, catalogHash: hash, capability: "create_test_payment_link", toolName: create.name, inputSchemaHash: sha(create.inputSchema), discoveredAt } },
  };
}

