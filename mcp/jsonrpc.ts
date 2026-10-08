/** Minimal JSON-RPC 2.0 helpers shared by the MCP clients. No dependency, no secret handling. */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: unknown;
}
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

export class McpProtocolError extends Error {}

export const timeoutError = (what: string): Error => Object.assign(new Error(`${what} timed out`), { name: "TimeoutError" });

/** The response with this id, from a JSON body or a Server-Sent Events stream, whichever the server chose. */
export function responseFromBody(body: string, contentType: string, id: number): JsonRpcResponse {
  const messages: unknown[] = [];
  if (contentType.includes("text/event-stream")) {
    for (const block of body.split(/\r?\n\r?\n/)) {
      const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
      if (data) messages.push(JSON.parse(data));
    }
  } else if (body.trim()) {
    const parsed: unknown = JSON.parse(body);
    messages.push(...(Array.isArray(parsed) ? parsed : [parsed]));
  }
  const match = messages.find((m): m is JsonRpcResponse => !!m && typeof m === "object" && (m as JsonRpcResponse).id === id);
  if (!match) throw new McpProtocolError("The MCP server did not answer the request");
  return match;
}

export function resultOf(response: JsonRpcResponse): unknown {
  if (response.error) throw new McpProtocolError(`MCP error ${response.error.code}: ${response.error.message}`.slice(0, 200));
  return response.result;
}

export interface RealTool {
  name: string;
  description?: string;
  inputSchema?: { type?: string; properties?: Record<string, unknown>; required?: string[] } & Record<string, unknown>;
  [key: string]: unknown;
}
export interface RawCallResult {
  content?: { type?: string; text?: string }[];
  structuredContent?: unknown;
  isError?: boolean;
}

/** What the Razorpay transport needs from any wire client. */
export interface McpWireClient {
  readonly serverInfo: { name: string | null; version: string | null };
  connect(): Promise<void>;
  listRawTools(): Promise<RealTool[]>;
  callRawTool(name: string, args: Record<string, unknown>): Promise<RawCallResult>;
  close(): Promise<void>;
}
