import type { McpCallResult, McpToolCatalog } from "./types";

export interface McpTransport {
  listTools(): Promise<McpToolCatalog>;
  callTool(input: { name: string; arguments: Record<string, unknown> }): Promise<McpCallResult>;
}

export class UnavailableMcpTransport implements McpTransport {
  async listTools(): Promise<McpToolCatalog> {
    return { serverId: "unavailable", serverVersion: null, mode: "unavailable", tools: [] };
  }
  async callTool(): Promise<McpCallResult> {
    throw new Error("No Razorpay MCP server is connected");
  }
}

