import { createHash } from "node:crypto";
import { canonicalJson } from "@/domain/agreement";
import { checkRazorpayKey, type KeyCheck } from "@/integrations/razorpay/keys";
import type { McpCallResult, McpToolCatalog } from "./types";
import type { McpTransport } from "./transport";
import { McpProtocolError, type McpWireClient, type RawCallResult, type RealTool } from "./jsonrpc";

/**
 * Razorpay's own MCP server describes its tools in its own words (parameters such as reference_id and
 * notify_sms, no environment label, no idempotency key). Our approval contract is stricter. This adapter is
 * the only place the two meet:
 *   - the catalog we show the capability binder is built from what the server really advertised, and it is
 *     only built when every parameter we depend on exists, including the two that switch notifications off;
 *   - the environment label comes from the key the app holds, never from the server;
 *   - the real schema's hash is folded into the adapted schema, so a change on the server invalidates approval;
 *   - only the two whitelisted tools can ever be called, with arguments we map ourselves.
 */
const sha = (value: unknown) => createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");

const CREATE = "create_payment_link";
const FETCH_BY_REFERENCE = "fetch_all_payment_links";
export const ALLOWED_REAL_TOOLS = [CREATE, FETCH_BY_REFERENCE] as const;

const OUTPUT_SCHEMA = { type: "object", properties: { id: { type: "string" }, short_url: { type: "string" }, status: { type: "string" } }, required: ["id", "short_url", "status"] } as const;
const has = (tool: RealTool | undefined, names: string[]) => !!tool && names.every((name) => !!tool.inputSchema?.properties && name in tool.inputSchema.properties);
const requires = (tool: RealTool | undefined, names: string[]) => !!tool && names.every((name) => tool.inputSchema?.required?.includes(name));

export function adaptRazorpayCatalog(rawTools: RealTool[], server: { name: string | null; version: string | null }, keyCheck: KeyCheck): McpToolCatalog {
  const mode = keyCheck.ok ? "test" : keyCheck.reason === "live_key_refused" ? "live" : "unavailable";
  const create = rawTools.find((tool) => tool.name === CREATE);
  const list = rawTools.find((tool) => tool.name === FETCH_BY_REFERENCE);
  const tools: unknown[] = [];
  // Every parameter we map to must exist, above all the two notification switches: without them a test link could message a real person.
  if (requires(create, ["amount", "currency"]) && has(create, ["description", "reference_id", "notify_sms", "notify_email", "reminder_enable"])) {
    tools.push({
      name: CREATE,
      description: "Create a standard Razorpay Payment Link (adapted)",
      metadata: { provider: "razorpay", environment: "test", capability: "create_payment_link" },
      inputSchema: {
        type: "object",
        properties: { amount: { type: "integer" }, currency: { type: "string" }, description: { type: "string" }, reference: { type: "string" }, idempotency_key: { type: "string" }, customer: { type: "object" } },
        required: ["amount", "currency", "description", "reference", "idempotency_key"],
        additionalProperties: false,
        "x-source-schema-sha256": sha(create!.inputSchema ?? {}),
      },
      outputSchema: OUTPUT_SCHEMA,
    });
  }
  if (has(list, ["reference_id"])) {
    tools.push({
      name: FETCH_BY_REFERENCE,
      description: "Find the Payment Link created for one reference (adapted)",
      metadata: { provider: "razorpay", environment: "test", capability: "fetch_payment_link" },
      inputSchema: { type: "object", properties: { reference: { type: "string" } }, required: ["reference"], additionalProperties: false, "x-source-schema-sha256": sha(list!.inputSchema ?? {}) },
      outputSchema: OUTPUT_SCHEMA,
    });
  }
  return { serverId: `razorpay-mcp:${server.name ?? "unknown"}`, serverVersion: server.version, mode, tools };
}

/** Our canonical arguments to the server's own parameters. Notifications and reminders are always off. */
export function toRealCreateArgs(canonical: Record<string, unknown>): Record<string, unknown> {
  const amount = canonical.amount;
  const reference = canonical.reference;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 100) throw new McpProtocolError("The amount is not a valid paise amount");
  if (canonical.currency !== "INR") throw new McpProtocolError("Only INR is supported");
  // The reference must survive Razorpay's 40-character limit unchanged: it is also how an unknown outcome is found again.
  if (typeof reference !== "string" || !reference || reference.length > 40) throw new McpProtocolError("The reference must be 1 to 40 characters");
  const customer = (canonical.customer ?? {}) as { name?: unknown };
  return {
    amount,
    currency: "INR",
    description: String(canonical.description ?? "").slice(0, 255),
    reference_id: reference,
    ...(typeof customer.name === "string" && customer.name ? { customer_name: customer.name.slice(0, 100) } : {}),
    notify_sms: false,
    notify_email: false,
    reminder_enable: false,
    notes: { adaptive_idempotency_key: String(canonical.idempotency_key ?? "") },
  };
}

function parsedBody(result: RawCallResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = result.content?.find((part) => typeof part.text === "string")?.text;
  if (!text) throw new McpProtocolError("The MCP tool returned no content");
  return JSON.parse(text);
}

/** Wraps a wire client so the rest of the product sees only the contract it already knows. */
export class RazorpayMcpTransport implements McpTransport {
  private connected = false;
  constructor(private readonly client: McpWireClient, private readonly keyCheck: KeyCheck = checkRazorpayKey(process.env.RAZORPAY_KEY_ID, process.env.RAZORPAY_KEY_SECRET)) {}

  private async ready() {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
  }

  async listTools(): Promise<McpToolCatalog> {
    await this.ready();
    return adaptRazorpayCatalog(await this.client.listRawTools(), this.client.serverInfo, this.keyCheck);
  }

  async callTool(input: { name: string; arguments: Record<string, unknown> }): Promise<McpCallResult> {
    if (!this.keyCheck.ok) throw new McpProtocolError("No Razorpay test key is configured");
    await this.ready();
    if (input.name === CREATE) {
      const result = await this.client.callRawTool(CREATE, toRealCreateArgs(input.arguments));
      if (result.isError) return { isError: true, content: result.content };
      return { structuredContent: parsedBody(result) };
    }
    if (input.name === FETCH_BY_REFERENCE) {
      const reference = input.arguments.reference;
      if (typeof reference !== "string" || !reference) throw new McpProtocolError("A reference is required");
      const result = await this.client.callRawTool(FETCH_BY_REFERENCE, { reference_id: reference });
      if (result.isError) return { isError: true, content: result.content };
      const body = parsedBody(result) as { payment_links?: unknown[]; items?: unknown[] } | unknown[];
      const links = (Array.isArray(body) ? body : (body.payment_links ?? body.items ?? [])) as { reference_id?: string }[];
      const match = links.find((link) => link.reference_id === reference);
      if (!match) throw new McpProtocolError("No Payment Link exists for that reference");
      return { structuredContent: match };
    }
    throw new McpProtocolError("That MCP tool is not permitted");
  }

  async close() {
    await this.client.close();
    this.connected = false;
  }
}
