import { bindRazorpayCapabilities } from "./capabilities";
import { failedMcpReceipt, hashMcpArguments, intentApprovalIsCurrent, reducePaymentLinkReceipt, type McpActionReceipt } from "./intents";
import { getMcpIntent, getMcpReceipt, saveMcpIntent, saveMcpReceipt } from "./store";
import type { McpTransport } from "./transport";

const responseBody = (result: { structuredContent?: unknown; content?: unknown; isError?: boolean }): unknown => {
  if (result.isError) throw new Error("MCP tool returned an error");
  return result.structuredContent ?? result.content;
};

/** The tool's own error text, with anything key-shaped or long and opaque removed, kept short enough to show. */
export function safeToolError(content: unknown): string {
  const text = Array.isArray(content) ? content.map((part) => (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "")).join(" ") : "";
  const cleaned = text.replace(/rzp_(test|live)_[A-Za-z0-9]+/g, "[key]").replace(/[A-Za-z0-9+/=_-]{28,}/g, "[redacted]").replace(/\s+/g, " ").trim().slice(0, 200);
  return cleaned || "no detail was given";
}

export async function executeMcpIntent(intentId: string, transport: McpTransport, now: string): Promise<McpActionReceipt> {
  const intent = await getMcpIntent(intentId);
  if (!intent) throw new Error("MCP intent not found");
  const existing = await getMcpReceipt(intentId);
  if (existing?.outcome === "succeeded" || existing?.outcome === "failed") return existing;

  const discovery = bindRazorpayCapabilities(await transport.listTools(), now);
  if (discovery.status !== "compatible") throw new Error(`Razorpay MCP capability unavailable: ${discovery.reason}`);
  const create = discovery.bindings.createTestPaymentLink!;
  if (create.catalogHash !== intent.catalogHash || create.serverId !== intent.serverId || create.toolName !== intent.toolName || create.inputSchemaHash !== intent.inputSchemaHash) {
    throw new Error("The MCP tool catalog changed; merchant approval is stale");
  }
  const currentArgumentsHash = hashMcpArguments(intent.canonicalArguments);
  if (!intentApprovalIsCurrent(intent, { termsHash: intent.termsHash, argumentsHash: currentArgumentsHash, catalogHash: create.catalogHash })) {
    if (!(existing?.outcome === "unknown" && intent.status === "unknown")) throw new Error("An approved MCP intent with current terms is required");
  }

  if (existing?.outcome === "unknown") {
    const fetch = discovery.bindings.fetchPaymentLink;
    if (!fetch) return existing;
    try {
      const result = await transport.callTool({ name: fetch.toolName, arguments: { reference: intent.canonicalArguments.reference } });
      const receipt = reducePaymentLinkReceipt(intent, responseBody(result), now, existing.requestedAt);
      await saveMcpReceipt(receipt);
      await saveMcpIntent({ ...intent, status: "succeeded" });
      return receipt;
    } catch {
      return existing;
    }
  }

  if (intent.status === "executing") {
    const receipt = failedMcpReceipt(intent, now, { outcome: "unknown", errorCode: "interrupted_execution", safeError: "The previous MCP outcome is unknown; reconcile before retry" });
    await saveMcpReceipt(receipt);
    await saveMcpIntent({ ...intent, status: "unknown" });
    return receipt;
  }
  if (intent.status !== "approved") throw new Error("An approved MCP intent is required");

  await saveMcpIntent({ ...intent, status: "executing" });
  try {
    const result = await transport.callTool({ name: create.toolName, arguments: intent.canonicalArguments });
    let receipt: McpActionReceipt;
    if (result.isError) {
      // The tool refused or failed: Razorpay reports that no link was made, so this can be reviewed again.
      receipt = failedMcpReceipt(intent, now, { outcome: "failed", errorCode: "tool_error", safeError: `Razorpay returned an error: ${safeToolError(result.content)}` });
    } else {
      try {
        receipt = reducePaymentLinkReceipt(intent, responseBody(result), now);
      } catch {
        // A reply we cannot read may belong to a link that was created. Never call this a clean failure: find it by reference first.
        receipt = failedMcpReceipt(intent, now, { outcome: "unknown", errorCode: "malformed_response", safeError: "Razorpay MCP returned a response that could not be read; reconcile before retry" });
      }
    }
    await saveMcpReceipt(receipt);
    await saveMcpIntent({ ...intent, status: receipt.outcome === "succeeded" ? "succeeded" : receipt.outcome });
    return receipt;
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    const receipt = failedMcpReceipt(intent, now, timeout
      ? { outcome: "unknown", errorCode: "timeout", safeError: "The Razorpay MCP outcome is unknown; reconcile before retry" }
      : { outcome: "failed", errorCode: "provider_error", safeError: "Razorpay MCP could not complete the test action" });
    await saveMcpReceipt(receipt);
    await saveMcpIntent({ ...intent, status: timeout ? "unknown" : "failed" });
    return receipt;
  }
}


/**
 * Read the current status of a link that was already created, with the advertised read tool, and store the new receipt.
 * It cannot create anything. If the read fails, the receipt on file is returned unchanged.
 */
export async function refreshMcpReceipt(intentId: string, transport: McpTransport, now: string): Promise<{ receipt: McpActionReceipt; refreshed: boolean }> {
  const intent = await getMcpIntent(intentId);
  if (!intent) throw new Error("MCP intent not found");
  const existing = await getMcpReceipt(intentId);
  if (existing?.outcome !== "succeeded") throw new Error("There is no created link to check");
  const discovery = bindRazorpayCapabilities(await transport.listTools(), now);
  const fetch = discovery.status === "compatible" ? discovery.bindings.fetchPaymentLink : undefined;
  if (!fetch || fetch.catalogHash !== intent.catalogHash) return { receipt: existing, refreshed: false };
  try {
    const result = await transport.callTool({ name: fetch.toolName, arguments: { reference: intent.canonicalArguments.reference } });
    const receipt = reducePaymentLinkReceipt(intent, responseBody(result), now, existing.requestedAt);
    await saveMcpReceipt(receipt);
    return { receipt, refreshed: true };
  } catch {
    return { receipt: existing, refreshed: false };
  }
}
