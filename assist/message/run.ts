import { createHash } from "node:crypto";
import { AssistGroq, type AssistFailure, type AssistMeta } from "../groq";
import { ASSIST_PROMPTS, promptHash } from "../prompts";
import { MessageInputSchema, MessageOutputSchema, type MessageInput } from "./schema";
import { validateMessage, type MessageReason } from "./validate";

export interface MessageRun {
  task: "negotiation_message.v1";
  promptHash: string;
  inputHash: string;
  status: "validated" | AssistFailure | "schema_rejected";
  meta: AssistMeta | null;
  /** The draft with slot tokens, only when it passed the filter. Otherwise null and the merchant writes it, as before. */
  template: string | null;
  reasons: MessageReason[];
  /** The model's raw output, kept for the evaluation record only. */
  raw: unknown;
}

/** Buyer text and merchant note go in as delimited data. */
export function messageUserContent(input: MessageInput): string {
  const i = MessageInputSchema.parse(input);
  const offers = i.offers.map((o) => `- ${o.alias}: ${o.headline} (slots: ${o.slots.join(", ")})`).join("\n");
  return `<buyer_message>\n${i.buyerRequest}\n</buyer_message>\n<offers>\n${offers}\n</offers>${i.merchantNote ? `\n<merchant_note>\n${i.merchantNote}\n</merchant_note>` : ""}`;
}
export const messageInputHash = (input: MessageInput): string => createHash("sha256").update(`${ASSIST_PROMPTS.negotiation_message.version}\n${messageUserContent(input)}`, "utf8").digest("hex");

/** One call, filtered by code. Never throws; a failure or a rejected draft leaves the message blank for the merchant. */
export async function runMessage(input: MessageInput, provider: AssistGroq): Promise<MessageRun> {
  const prompt = ASSIST_PROMPTS.negotiation_message;
  const base = { task: "negotiation_message.v1" as const, promptHash: promptHash(prompt), inputHash: messageInputHash(input) };
  const result = await provider.generate({ system: prompt.system, user: messageUserContent(input), name: "adaptive_deals_negotiation_message", schema: MessageOutputSchema });
  if (!result.ok) return { ...base, status: result.failure, meta: result.meta, template: null, reasons: [], raw: null };
  const parsed = MessageOutputSchema.safeParse(result.raw);
  if (!parsed.success) return { ...base, status: "schema_rejected", meta: result.meta, template: null, reasons: [], raw: result.raw };
  const verdict = validateMessage(input, parsed.data.message);
  return { ...base, status: "validated", meta: result.meta, template: verdict.accepted ? parsed.data.message : null, reasons: verdict.reasons, raw: result.raw };
}
