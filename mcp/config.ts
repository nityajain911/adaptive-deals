import { checkRazorpayKey } from "@/integrations/razorpay/keys";
import { HttpMcpClient } from "./http-client";
import { RazorpayMcpTransport } from "./razorpay-adapter";
import { StdioMcpClient } from "./stdio-client";
import { UnavailableMcpTransport, type McpTransport } from "./transport";

/** The only remote endpoint a Razorpay key may be sent to. It cannot be changed through the environment. */
export const RAZORPAY_REMOTE_MCP_URL = "https://mcp.razorpay.com/mcp";
const DEFAULT_STDIO = ["docker", "run", "--rm", "-i", "-e", "RAZORPAY_KEY_ID", "-e", "RAZORPAY_KEY_SECRET", "razorpay/mcp"];

export type McpConnectionStatus = { connected: true; via: "remote" | "stdio" } | { connected: false; reason: "not_configured" | "missing_key" | "live_key_refused" | "unrecognised_key" | "missing_secret" };

export function mcpConnectionStatus(env: Record<string, string | undefined> = process.env): McpConnectionStatus {
  const via = env.RAZORPAY_MCP_MODE;
  if (via !== "remote" && via !== "stdio") return { connected: false, reason: "not_configured" };
  const key = checkRazorpayKey(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET);
  if (!key.ok) return { connected: false, reason: key.reason === "missing" ? "missing_key" : key.reason === "live_key_refused" ? "live_key_refused" : key.reason === "missing_secret" ? "missing_secret" : "unrecognised_key" };
  return { connected: true, via };
}

/**
 * Real transport only when MCP mode is set and a valid rzp_test_ key pair is held. A live key, a missing
 * key or no mode all give the unavailable transport, so the product keeps saying no action occurred.
 */
export function mcpTransportFromEnv(env: Record<string, string | undefined> = process.env): McpTransport {
  const status = mcpConnectionStatus(env);
  if (!status.connected) return new UnavailableMcpTransport();
  const key = checkRazorpayKey(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET);
  if (!key.ok) return new UnavailableMcpTransport();
  const secret = env.RAZORPAY_KEY_SECRET!;
  if (status.via === "remote") return new RazorpayMcpTransport(new HttpMcpClient(RAZORPAY_REMOTE_MCP_URL, { keyId: key.keyId, keySecret: secret }), key);
  const command = env.RAZORPAY_MCP_COMMAND ? [env.RAZORPAY_MCP_COMMAND, ...(JSON.parse(env.RAZORPAY_MCP_ARGS ?? "[]") as string[])] : DEFAULT_STDIO;
  return new RazorpayMcpTransport(new StdioMcpClient(command[0]!, command.slice(1), { RAZORPAY_KEY_ID: key.keyId, RAZORPAY_KEY_SECRET: secret }), key);
}
