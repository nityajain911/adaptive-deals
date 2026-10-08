import "server-only";

import { mcpConnectionStatus, type McpConnectionStatus } from "@/mcp/config";
import { mcpIntentIdFor, type McpActionIntent, type McpActionReceipt } from "@/mcp/intents";
import { getMcpIntent, getMcpReceipt } from "@/mcp/store";
import { activeVersionOf } from "@/lib/views";
import { getState } from "@/lib/service";

export interface McpCollectionView {
  connection: McpConnectionStatus;
  intent: McpActionIntent | null;
  receipt: McpActionReceipt | null;
}

/** What Track needs to show the Razorpay action: the connection, and any intent and receipt already recorded. Contacts no server. */
export async function mcpCollectionView(): Promise<McpCollectionView> {
  const state = await getState();
  const agreement = activeVersionOf(state.agreements);
  const connection = mcpConnectionStatus();
  if (!agreement) return { connection, intent: null, receipt: null };
  const id = mcpIntentIdFor({ dealId: state.dealId, agreementId: agreement.agreementId, agreementVersion: agreement.version });
  const intent = await getMcpIntent(id);
  return { connection, intent, receipt: intent ? await getMcpReceipt(id) : null };
}
