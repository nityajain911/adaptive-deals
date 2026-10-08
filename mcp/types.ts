export interface McpToolCatalog {
  serverId: string;
  serverVersion: string | null;
  mode: "test" | "live" | string;
  tools: unknown[];
}

export interface McpCapabilityBinding {
  serverId: string;
  serverVersion: string | null;
  catalogHash: string;
  capability: "create_test_payment_link" | "fetch_payment_link";
  toolName: string;
  inputSchemaHash: string;
  discoveredAt: string;
}

export interface McpCallResult {
  content?: unknown;
  structuredContent?: unknown;
  isError?: boolean;
}

