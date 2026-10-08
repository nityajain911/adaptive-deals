import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resultOf, timeoutError, type JsonRpcResponse, type McpWireClient, type RawCallResult, type RealTool } from "./jsonrpc";

const PROTOCOL = "2025-03-26";

/**
 * Stdio MCP client for a locally started Razorpay server (for example the official Docker image). The key
 * pair reaches the child only through its environment, never its arguments, and nothing it prints to stderr
 * is kept.
 */
export class StdioMcpClient implements McpWireClient {
  serverInfo: { name: string | null; version: string | null } = { name: null, version: null };
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private next = 1;
  private readonly waiting = new Map<number, (r: JsonRpcResponse) => void>();

  constructor(private readonly command: string, private readonly args: string[], private readonly env: Record<string, string>, private readonly timeoutMs = 30_000) {}

  private send(message: object) {
    this.child!.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(timeoutError("The MCP request"));
      }, this.timeoutMs);
      this.waiting.set(id, (response) => {
        clearTimeout(timer);
        try {
          resolve(resultOf(response));
        } catch (error) {
          reject(error);
        }
      });
      this.send({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
    });
  }

  async connect(): Promise<void> {
    this.child = spawn(this.command, this.args, { env: { ...process.env, ...this.env }, stdio: ["pipe", "pipe", "ignore"] }) as unknown as ChildProcessWithoutNullStreams;
    this.child.stdout.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8");
      let at: number;
      while ((at = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, at).trim();
        this.buffer = this.buffer.slice(at + 1);
        if (!line) continue;
        try {
          const message = JSON.parse(line) as JsonRpcResponse;
          if (typeof message.id === "number") this.waiting.get(message.id)?.(message);
        } catch {
          // Not JSON-RPC (a log line): ignore it.
        }
      }
    });
    this.child.on("error", () => {
      for (const [id, resolve] of this.waiting) resolve({ jsonrpc: "2.0", id, error: { code: -1, message: "The MCP server process could not run" } });
    });
    const init = (await this.request("initialize", { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "adaptive-deals", version: "1" } })) as { serverInfo?: { name?: string; version?: string } } | undefined;
    this.serverInfo = { name: init?.serverInfo?.name ?? null, version: init?.serverInfo?.version ?? null };
    this.send({ jsonrpc: "2.0", method: "notifications/initialized" });
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
    this.child?.kill();
    this.child = null;
  }
}
