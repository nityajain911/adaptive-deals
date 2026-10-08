import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "@/domain/agreement";

const hex64 = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.string().datetime({ offset: true });

const customerSchema = z.object({ name: z.string().min(1), email: z.string().email().optional(), contact: z.string().min(3).optional() }).strict();
const argumentsSchema = z.object({
  amount: z.number().int().positive(), currency: z.literal("INR"), description: z.string().min(1).max(255), reference: z.string().min(1).max(80),
  idempotency_key: z.string().regex(/^ad_[a-f0-9]{32}$/), customer: customerSchema.optional(),
}).strict();

export const mcpIntentSchema = z.object({
  id: z.string().regex(/^mcp-intent-[a-f0-9]{20}$/), dealId: z.string().min(1), agreementId: z.string().min(1), agreementVersion: z.number().int().positive(),
  termsHash: hex64, capability: z.literal("create_test_payment_link"), serverId: z.string().min(1), toolName: z.string().min(1), catalogHash: hex64, inputSchemaHash: hex64,
  canonicalArguments: argumentsSchema, argumentsHash: hex64, idempotencyKey: z.string().regex(/^ad_[a-f0-9]{32}$/), mode: z.literal("test"),
  status: z.enum(["draft", "approved", "executing", "succeeded", "failed", "unknown"]), approvedBy: z.string().min(1).nullable(), approvedAt: instant.nullable(),
}).strict();

export const mcpReceiptSchema = z.object({
  intentId: z.string().min(1), serverId: z.string().min(1), toolName: z.string().min(1), catalogHash: hex64, argumentsHash: hex64,
  requestedAt: instant, completedAt: instant.nullable(), outcome: z.enum(["succeeded", "failed", "unknown"]), externalId: z.string().min(1).nullable(),
  shortUrl: z.string().url().nullable(), externalStatus: z.string().min(1).nullable(), responseHash: hex64.nullable(), errorCode: z.string().min(1).nullable(), safeError: z.string().min(1).nullable(),
}).strict();

export type McpActionIntent = z.infer<typeof mcpIntentSchema>;
export type McpActionReceipt = z.infer<typeof mcpReceiptSchema>;

const sha = (value: unknown) => createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
export const hashMcpArguments = (value: unknown): string => sha(value);

export function createPaymentLinkIntent(input: {
  dealId: string; agreementId: string; agreementVersion: number; termsHash: string; merchantId: string; serverId: string; toolName: string; catalogHash: string; inputSchemaHash: string;
  amountPaise: number; currency: "INR"; description: string; reference: string; customer?: { name: string; email?: string; contact?: string };
}): McpActionIntent {
  const idempotencyKey = `ad_${sha({ merchantId: input.merchantId, agreementId: input.agreementId, version: input.agreementVersion, termsHash: input.termsHash, capability: "create_test_payment_link", amount: input.amountPaise }).slice(0, 32)}`;
  const canonicalArguments = argumentsSchema.parse({ amount: input.amountPaise, currency: input.currency, description: input.description, reference: input.reference, idempotency_key: idempotencyKey, ...(input.customer ? { customer: input.customer } : {}) });
  const argumentsHash = sha(canonicalArguments);
  return mcpIntentSchema.parse({
    id: `mcp-intent-${sha({ dealId: input.dealId, agreementId: input.agreementId, version: input.agreementVersion, capability: "create_test_payment_link" }).slice(0, 20)}`,
    dealId: input.dealId, agreementId: input.agreementId, agreementVersion: input.agreementVersion, termsHash: input.termsHash,
    capability: "create_test_payment_link", serverId: input.serverId, toolName: input.toolName, catalogHash: input.catalogHash, inputSchemaHash: input.inputSchemaHash,
    canonicalArguments, argumentsHash, idempotencyKey, mode: "test", status: "draft", approvedBy: null, approvedAt: null,
  });
}

export function approveMcpIntent(intent: McpActionIntent, approvedBy: string, approvedAt: string): McpActionIntent {
  if (intent.status !== "draft") throw new Error("Only a draft MCP intent can be approved");
  return mcpIntentSchema.parse({ ...intent, status: "approved", approvedBy, approvedAt });
}

export function intentApprovalIsCurrent(intent: McpActionIntent, current: { termsHash: string; argumentsHash: string; catalogHash: string }): boolean {
  return intent.status === "approved" && intent.termsHash === current.termsHash && intent.argumentsHash === current.argumentsHash && intent.catalogHash === current.catalogHash;
}

export function reducePaymentLinkReceipt(intent: McpActionIntent, raw: unknown, completedAt: string, requestedAt = intent.approvedAt ?? completedAt): McpActionReceipt {
  const parsed = z.object({ id: z.string().min(1), short_url: z.string().url(), status: z.string().min(1) }).passthrough().parse(raw);
  return mcpReceiptSchema.parse({ intentId: intent.id, serverId: intent.serverId, toolName: intent.toolName, catalogHash: intent.catalogHash, argumentsHash: intent.argumentsHash, requestedAt, completedAt, outcome: "succeeded", externalId: parsed.id, shortUrl: parsed.short_url, externalStatus: parsed.status, responseHash: sha(raw), errorCode: null, safeError: null });
}

export function failedMcpReceipt(intent: McpActionIntent, requestedAt: string, input: { outcome: "failed" | "unknown"; errorCode: string; safeError: string }): McpActionReceipt {
  return mcpReceiptSchema.parse({ intentId: intent.id, serverId: intent.serverId, toolName: intent.toolName, catalogHash: intent.catalogHash, argumentsHash: intent.argumentsHash, requestedAt, completedAt: input.outcome === "failed" ? requestedAt : null, outcome: input.outcome, externalId: null, shortUrl: null, externalStatus: null, responseHash: null, errorCode: input.errorCode, safeError: input.safeError });
}
