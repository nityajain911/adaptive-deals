import "server-only";
import { mcpIntentSchema, mcpReceiptSchema, type McpActionIntent, type McpActionReceipt } from "./intents";
import { rm } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, readJson, serialised, writeJsonAtomic } from "@/lib/store";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const intentFile = (id: string) => `mcp/intents/${id}.json`;
const receiptFile = (id: string) => `mcp/receipts/${id}.json`;

export const getMcpIntent = (id: string): Promise<McpActionIntent | null> => serialised(async () => {
  const value = await readJson<unknown>(intentFile(id));
  return value === null ? null : mcpIntentSchema.parse(value);
});

export const recordMcpIntent = (input: McpActionIntent): Promise<McpActionIntent> => serialised(async () => {
  const intent = mcpIntentSchema.parse(input);
  const existing = await readJson<unknown>(intentFile(intent.id));
  if (existing !== null) {
    const parsed = mcpIntentSchema.parse(existing);
    if (!same(parsed, intent)) throw new Error(`MCP intent ${intent.id} already exists with different content`);
    return parsed;
  }
  await writeJsonAtomic(intentFile(intent.id), intent);
  return intent;
});

export const saveMcpIntent = (input: McpActionIntent): Promise<McpActionIntent> => serialised(async () => {
  const intent = mcpIntentSchema.parse(input);
  await writeJsonAtomic(intentFile(intent.id), intent);
  return intent;
});

export const getMcpReceipt = (intentId: string): Promise<McpActionReceipt | null> => serialised(async () => {
  const value = await readJson<unknown>(receiptFile(intentId));
  return value === null ? null : mcpReceiptSchema.parse(value);
});

export const recordMcpReceipt = (input: McpActionReceipt): Promise<McpActionReceipt> => serialised(async () => {
  const receipt = mcpReceiptSchema.parse(input);
  const existing = await readJson<unknown>(receiptFile(receipt.intentId));
  if (existing !== null) {
    const parsed = mcpReceiptSchema.parse(existing);
    if (!same(parsed, receipt)) throw new Error(`MCP receipt ${receipt.intentId} already exists with different content`);
    return parsed;
  }
  await writeJsonAtomic(receiptFile(receipt.intentId), receipt);
  return receipt;
});

export const saveMcpReceipt = (input: McpActionReceipt): Promise<McpActionReceipt> => serialised(async () => {
  const receipt = mcpReceiptSchema.parse(input);
  await writeJsonAtomic(receiptFile(receipt.intentId), receipt);
  return receipt;
});


/**
 * A failed attempt (the tool returned an error, so no link exists) may be reviewed again. Its receipt is kept
 * under a dated name, then cleared, and the intent returns to draft so the merchant approves it afresh.
 */
export const archiveFailedAttempt = (intentId: string, fresh: McpActionIntent): Promise<void> => serialised(async () => {
  const receipt = await readJson<unknown>(receiptFile(intentId));
  if (receipt !== null) {
    const parsed = mcpReceiptSchema.parse(receipt);
    if (parsed.outcome !== "failed") throw new Error("Only a failed attempt can be reviewed again");
    await writeJsonAtomic(`mcp/receipts/${intentId}.failed-${parsed.requestedAt.replace(/[^0-9A-Za-z]/g, "")}.json`, parsed);
    await rm(path.join(DATA_DIR, receiptFile(intentId)), { force: true });
  }
  await writeJsonAtomic(intentFile(intentId), mcpIntentSchema.parse(fresh));
});
