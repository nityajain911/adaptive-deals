import { canonicalJson } from "@/domain/agreement";
import { DEMO_ANCHOR } from "@/domain/clock";
import { bindRazorpayCapabilities } from "@/mcp/capabilities";
import { approveMcpIntent, createPaymentLinkIntent, type McpActionIntent, type McpActionReceipt } from "@/mcp/intents";
import { executeMcpIntent } from "@/mcp/executor";
import { archiveFailedAttempt, getMcpIntent, recordMcpIntent, saveMcpIntent } from "@/mcp/store";
import { mcpTransportFromEnv } from "@/mcp/config";
import type { McpTransport } from "@/mcp/transport";
import { activeVersionOf } from "@/lib/views";
import { activeCase, getState } from "@/lib/service";

export class McpActionError extends Error {}

const nowOf = (state: Awaited<ReturnType<typeof getState>>) => state.clockAdvances.at(-1)?.to ?? DEMO_ANCHOR;

async function deriveIntent(transport: McpTransport): Promise<McpActionIntent> {
  const state = await getState();
  const agreement = activeVersionOf(state.agreements);
  if (state.status !== "active" || !agreement?.buyerAcceptance) throw new McpActionError("An active accepted agreement is required before preparing a collection action");
  const attempt = state.attempts.find((item) => item.agreementVersion === agreement.version && item.method === "payment_link" && item.status === "scheduled");
  if (!attempt) throw new McpActionError("No unpaid scheduled Payment Link is available for this agreement");
  const discovery = bindRazorpayCapabilities(await transport.listTools(), nowOf(state));
  const binding = discovery.bindings.createTestPaymentLink;
  if (discovery.status !== "compatible" || !binding) throw new McpActionError(`No compatible Razorpay test Payment Link is connected: ${discovery.reason}`);
  return createPaymentLinkIntent({
    dealId: state.dealId,
    agreementId: agreement.agreementId,
    agreementVersion: agreement.version,
    termsHash: agreement.termsHash,
    merchantId: "merchant-pinecone",
    serverId: binding.serverId,
    toolName: binding.toolName,
    catalogHash: binding.catalogHash,
    inputSchemaHash: binding.inputSchemaHash,
    amountPaise: attempt.amountPaise,
    currency: "INR",
    description: `Adaptive Deals ${agreement.agreementId} v${agreement.version} · instalment ${attempt.scheduleLineId}`,
    reference: attempt.idempotencyKey,
    customer: { name: activeCase(state).buyer.name },
  });
}

const sameApprovedInputs = (a: McpActionIntent, b: McpActionIntent) => canonicalJson({ termsHash: a.termsHash, catalogHash: a.catalogHash, inputSchemaHash: a.inputSchemaHash, toolName: a.toolName, argumentsHash: a.argumentsHash }) === canonicalJson({ termsHash: b.termsHash, catalogHash: b.catalogHash, inputSchemaHash: b.inputSchemaHash, toolName: b.toolName, argumentsHash: b.argumentsHash });

export async function prepareMcpCollectionIntent(transport: McpTransport = mcpTransportFromEnv()): Promise<McpActionIntent> {
  const fresh = await deriveIntent(transport);
  const stored = await getMcpIntent(fresh.id);
  // An attempt the tool reported as failed may be reviewed again; its receipt is archived, never deleted.
  if (stored?.status === "failed") {
    await archiveFailedAttempt(fresh.id, fresh);
    return fresh;
  }
  return recordMcpIntent(fresh);
}

export async function approveMcpCollectionIntent(intentId: string, transport: McpTransport = mcpTransportFromEnv()): Promise<McpActionIntent> {
  const stored = await getMcpIntent(intentId);
  if (!stored) throw new McpActionError("MCP intent not found");
  const current = await deriveIntent(transport);
  if (stored.id !== current.id || !sameApprovedInputs(stored, current)) throw new McpActionError("The agreement, action arguments or MCP catalog changed; review the action again");
  return saveMcpIntent(approveMcpIntent(stored, "Merchant (Pinecone Media Works)", nowOf(await getState())));
}

export async function executeMcpCollectionIntent(intentId: string, transport: McpTransport = mcpTransportFromEnv()): Promise<McpActionReceipt> {
  const stored = await getMcpIntent(intentId);
  if (!stored) throw new McpActionError("MCP intent not found");
  const current = await deriveIntent(transport);
  if (stored.id !== current.id || !sameApprovedInputs(stored, current)) throw new McpActionError("The approved MCP action is stale");
  return executeMcpIntent(intentId, transport, nowOf(await getState()));
}

