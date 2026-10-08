import { McpProtocolError, resultOf, responseFromBody, timeoutError, type McpWireClient, type RawCallResult, type RealTool } from "./jsonrpc";

const PROTOCOL = "2025-03-26";

/**
 * Streamable-HTTP MCP client over fetch. The credential is sent only in the Authorization header, and
 * every error message is stripped of it before it can be shown or stored.
 */
export class HttpMcpClient implements McpWireClient {
  serverInfo: { name: string | null; version: string | null } = { name: null, version: null };
  private session: string | null = null;
  private next = 1;
  private readonly authorization: string;

  constructor(
    private readonly url: string,
    credential: { keyId: string; keySecret: string },
    private readonly options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
  ) {
    this.authorization = `Basic ${Buffer.from(`${credential.keyId}:${credential.keySecret}`).toString("base64")}`;
    this.secrets = [credential.keySecret, this.authorization, Buffer.from(`${credential.keyId}:${credential.keySecret}`).toString("base64")];
  }
  private readonly secrets: string[];

  private scrub(message: string): string {
    return this.secrets.reduce((text, secret) => (secret ? text.split(secret).join("[redacted]") : text), message).slice(0, 200);
  }

  private async post(body: object, expectResponse: boolean): Promise<{ text: string; type: string; status: number }> {
    const doFetch = this.options.fetchImpl ?? fetch;
    try {
      const res = await doFetch(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: this.authorization,
          "mcp-protocol-version": PROTOCOL,
          ...(this.session ? { "mcp-session-id": this.session } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 20_000),
      });
      const session = res.headers.get("mcp-session-id");
      if (session) this.session = session;
      if (res.status === 401 || res.status === 403) throw new McpProtocolError("The MCP server rejected the credentials");
      if (expectResponse && !res.ok) throw new McpProtocolError(`The MCP server returned HTTP ${res.status}`);
      return { text: await res.text(), type: res.headers.get("content-type") ?? "", status: res.status };
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") throw timeoutError("The MCP request");
      if (error instanceof McpProtocolError) throw new McpProtocolError(this.scrub(error.message));
      throw new McpProtocolError(this.scrub(error instanceof Error ? error.message : "MCP request failed"));
    }
  }

  private async request(method: string, params?: unknown): Promise<unknown> {
    const id = this.next++;
    const { text, type } = await this.post({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) }, true);
    return resultOf(responseFromBody(text, type, id));
  }

  async connect(): Promise<void> {
    const init = (await this.request("initialize", { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "adaptive-deals", version: "1" } })) as { serverInfo?: { name?: string; version?: string } } | undefined;
    this.serverInfo = { name: init?.serverInfo?.name ?? null, version: init?.serverInfo?.version ?? null };
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }, false);
  }

  async listRawTools(): Promise<RealTool[]> {
    const tools: RealTool[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const result = (await this.request("tools/list", cursor ? { cursor } : {})) as { tools?: RealTool[]; nextCursor?: string };
      tools.push(...(result.tools ?? []));
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    return tools;
  }

  async callRawTool(name: string, args: Record<string, unknown>): Promise<RawCallResult> {
    return (await this.request("tools/call", { name, arguments: args })) as RawCallResult;
  }

  async close(): Promise<void> {
    this.session = null;
  }
}
