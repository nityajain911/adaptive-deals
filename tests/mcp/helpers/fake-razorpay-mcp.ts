import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** The tools as the official Razorpay MCP server defines them (razorpay-mcp-server, pkg/razorpay/payment_links.go). */
export const REAL_CREATE_TOOL = {
  name: "create_payment_link",
  description: "Create a new standard payment link in Razorpay with a specified amount",
  inputSchema: {
    type: "object",
    properties: {
      amount: { type: "number", minimum: 100 }, currency: { type: "string" }, description: { type: "string" }, accept_partial: { type: "boolean" },
      first_min_partial_amount: { type: "number" }, expire_by: { type: "number" }, reference_id: { type: "string" }, customer_name: { type: "string" },
      customer_email: { type: "string" }, customer_contact: { type: "string" }, notify_sms: { type: "boolean" }, notify_email: { type: "boolean" },
      reminder_enable: { type: "boolean" }, notes: { type: "object" }, callback_url: { type: "string" }, callback_method: { type: "string" },
    },
    required: ["amount", "currency"],
  },
};
export const REAL_FETCH_ALL_TOOL = {
  name: "fetch_all_payment_links",
  description: "Fetch all payment links with optional filtering by payment ID or reference ID",
  inputSchema: { type: "object", properties: { payment_id: { type: "string" }, reference_id: { type: "string" }, upi_link: { type: "number" } }, required: [] },
};
export const REAL_FETCH_TOOL = { name: "fetch_payment_link", description: "Fetch payment link details using its ID", inputSchema: { type: "object", properties: { payment_link_id: { type: "string" } }, required: ["payment_link_id"] } };
export const REAL_REFUND_TOOL = { name: "create_refund", description: "Create a refund", inputSchema: { type: "object", properties: { payment_id: { type: "string" } }, required: ["payment_id"] } };

export interface FakeState {
  tools: unknown[];
  links: { id: string; short_url: string; status: string; reference_id: string }[];
  calls: { method: string; name?: string; args?: Record<string, unknown> }[];
  authorization: string[];
  mode: "json" | "sse";
  hang: boolean;
  status: number;
  /** Fail the next create call with a duplicate-reference style error. */
  createError: boolean;
}

export const freshState = (): FakeState => ({ tools: [REAL_CREATE_TOOL, REAL_FETCH_ALL_TOOL, REAL_FETCH_TOOL, REAL_REFUND_TOOL], links: [], calls: [], authorization: [], mode: "json", hang: false, status: 200, createError: false });

const readBody = (req: IncomingMessage) => new Promise<string>((resolve) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => resolve(b)); });

export async function startFakeRazorpayMcp(state: FakeState): Promise<{ url: string; server: Server }> {
  const server = createServer(async (req, res) => {
    state.authorization.push(String(req.headers.authorization ?? ""));
    if (state.status !== 200) {
      res.writeHead(state.status).end();
      return;
    }
    const msg = JSON.parse((await readBody(req)) || "{}") as { id?: number; method: string; params?: { name?: string; arguments?: Record<string, unknown> } };
    state.calls.push({ method: msg.method, name: msg.params?.name, args: msg.params?.arguments });
    if (msg.id === undefined) return void res.writeHead(202).end();
    if (state.hang && msg.method === "tools/call") return; // never answers
    let result: unknown;
    if (msg.method === "initialize") result = { protocolVersion: "2025-03-26", serverInfo: { name: "razorpay-mcp-server", version: "1.2.3" }, capabilities: { tools: {} } };
    else if (msg.method === "tools/list") result = { tools: state.tools };
    else if (msg.params?.name === "create_payment_link") {
      if (state.createError) result = { isError: true, content: [{ type: "text", text: "creating payment link failed: duplicate reference" }] };
      else {
        const a = msg.params.arguments ?? {};
        const link = { id: `plink_${state.links.length + 1}`, short_url: `https://rzp.io/i/${state.links.length + 1}`, status: "created", reference_id: String(a.reference_id), amount: a.amount, notify: { sms: a.notify_sms, email: a.notify_email } };
        state.links.push(link);
        result = { content: [{ type: "text", text: JSON.stringify(link) }] };
      }
    } else if (msg.params?.name === "fetch_all_payment_links") {
      const ref = msg.params.arguments?.reference_id;
      result = { content: [{ type: "text", text: JSON.stringify({ payment_links: state.links.filter((l) => !ref || l.reference_id === ref) }) }] };
    } else result = { isError: true, content: [{ type: "text", text: "unknown tool" }] };
    const body = JSON.stringify({ jsonrpc: "2.0", id: msg.id, result });
    if (state.mode === "sse") res.writeHead(200, { "content-type": "text/event-stream", "mcp-session-id": "s1" }).end(`event: message\ndata: ${body}\n\n`);
    else res.writeHead(200, { "content-type": "application/json", "mcp-session-id": "s1" }).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`, server };
}
