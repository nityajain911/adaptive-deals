/**
 * Read-only discovery of the Razorpay MCP server. It connects, lists the tools it advertises, and reports
 * whether our approved Payment Link capability can bind. It never calls a tool: no link is created, nothing
 * is fetched, nothing is charged.
 *
 *   RAZORPAY_MCP_MODE=remote|stdio RAZORPAY_KEY_ID=rzp_test_... RAZORPAY_KEY_SECRET=... npm run mcp:discover
 *
 * The key is read from your environment and is never printed. A live key (rzp_live_) is refused.
 */
import { writeFileSync } from "node:fs";
import { bindRazorpayCapabilities } from "@/mcp/capabilities";
import { HttpMcpClient } from "@/mcp/http-client";
import { mcpConnectionStatus, RAZORPAY_REMOTE_MCP_URL } from "@/mcp/config";
import { adaptRazorpayCatalog } from "@/mcp/razorpay-adapter";
import { StdioMcpClient } from "@/mcp/stdio-client";
import { checkRazorpayKey } from "@/integrations/razorpay/keys";
import type { McpWireClient } from "@/mcp/jsonrpc";

async function main() {
  const status = mcpConnectionStatus();
  if (!status.connected) {
    console.log(`Not connected: ${status.reason}. Set RAZORPAY_MCP_MODE (remote or stdio) and a rzp_test_ key pair in your environment.`);
    return;
  }
  const key = checkRazorpayKey(process.env.RAZORPAY_KEY_ID, process.env.RAZORPAY_KEY_SECRET);
  if (!key.ok) return;
  const secret = process.env.RAZORPAY_KEY_SECRET!;
  const command = process.env.RAZORPAY_MCP_COMMAND ? [process.env.RAZORPAY_MCP_COMMAND, ...(JSON.parse(process.env.RAZORPAY_MCP_ARGS ?? "[]") as string[])] : ["docker", "run", "--rm", "-i", "-e", "RAZORPAY_KEY_ID", "-e", "RAZORPAY_KEY_SECRET", "razorpay/mcp"];
  const client: McpWireClient = status.via === "remote" ? new HttpMcpClient(RAZORPAY_REMOTE_MCP_URL, { keyId: key.keyId, keySecret: secret }) : new StdioMcpClient(command[0]!, command.slice(1), { RAZORPAY_KEY_ID: key.keyId, RAZORPAY_KEY_SECRET: secret });
  try {
    await client.connect();
    const tools = await client.listRawTools();
    const catalog = adaptRazorpayCatalog(tools, client.serverInfo, key);
    const binding = bindRazorpayCapabilities(catalog);
    const report = {
      observedAt: new Date().toISOString(),
      via: status.via,
      server: client.serverInfo,
      keyMode: "test",
      toolsAdvertised: tools.map((tool) => tool.name),
      paymentLinkTools: tools.filter((tool) => tool.name.includes("payment_link")).map((tool) => ({ name: tool.name, parameters: Object.keys(tool.inputSchema?.properties ?? {}), required: tool.inputSchema?.required ?? [] })),
      capability: { status: binding.status, reason: binding.reason, catalogHash: binding.catalogHash, createBound: !!binding.bindings.createTestPaymentLink, fetchBound: !!binding.bindings.fetchPaymentLink },
      toolCallsMade: 0,
    };
    console.log(JSON.stringify(report, null, 2));
    const out = process.argv.indexOf("--write");
    if (out >= 0 && process.argv[out + 1]) writeFileSync(process.argv[out + 1]!, JSON.stringify(report, null, 2) + "\n");
  } catch (error) {
    console.log(`Discovery failed: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`);
    process.exitCode = 1;
  } finally {
    await client.close().catch(() => undefined);
  }
}
main();
