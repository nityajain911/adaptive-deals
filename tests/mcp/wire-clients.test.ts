import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { HttpMcpClient } from "@/mcp/http-client";
import { StdioMcpClient } from "@/mcp/stdio-client";
import { mcpConnectionStatus, mcpTransportFromEnv, RAZORPAY_REMOTE_MCP_URL } from "@/mcp/config";
import { RazorpayMcpTransport } from "@/mcp/razorpay-adapter";
import { UnavailableMcpTransport } from "@/mcp/transport";
import { checkRazorpayKey } from "@/integrations/razorpay/keys";
import { approveMcpIntent, createPaymentLinkIntent } from "@/mcp/intents";
import { bindRazorpayCapabilities } from "@/mcp/capabilities";
import { freshState, startFakeRazorpayMcp, type FakeState } from "./helpers/fake-razorpay-mcp";

const dataDir = mkdtempSync(path.join(os.tmpdir(), "adaptive-deals-mcp-wire-"));
process.env.ADAPTIVE_DEALS_DATA_DIR = dataDir;
const store = await import("@/mcp/store");
const { executeMcpIntent } = await import("@/mcp/executor");

const KEY = { keyId: "rzp_test_abcdef123456", keySecret: "s3cret-value-xyz" };
const TEST = checkRazorpayKey(KEY.keyId, KEY.keySecret);
let state: FakeState;
let url: string;
let close: () => void;

beforeAll(async () => {
  state = freshState();
  const s = await startFakeRazorpayMcp(state);
  url = s.url;
  close = () => s.server.close();
});
afterAll(() => {
  close();
  rmSync(dataDir, { recursive: true, force: true });
});
beforeEach(() => {
  Object.assign(state, freshState());
  rmSync(path.join(dataDir, "mcp"), { recursive: true, force: true });
});
afterEach(() => undefined);

describe("the HTTP client", () => {
  it("initialises, lists tools and sends the credential only in the Authorization header", async () => {
    const client = new HttpMcpClient(url, KEY);
    await client.connect();
    const tools = await client.listRawTools();
    expect(client.serverInfo).toEqual({ name: "razorpay-mcp-server", version: "1.2.3" });
    expect(tools.map((t) => t.name)).toContain("create_payment_link");
    const expected = `Basic ${Buffer.from(`${KEY.keyId}:${KEY.keySecret}`).toString("base64")}`;
    expect(new Set(state.authorization)).toEqual(new Set([expected]));
    expect(JSON.stringify(state.calls)).not.toContain(KEY.keySecret);
    expect(state.calls.map((c) => c.method)).toEqual(["initialize", "notifications/initialized", "tools/list"]);
  });
  it("reads a Server-Sent Events response", async () => {
    state.mode = "sse";
    const client = new HttpMcpClient(url, KEY);
    await client.connect();
    expect((await client.listRawTools()).length).toBeGreaterThan(0);
  });
  it("reports rejected credentials without echoing the secret", async () => {
    state.status = 401;
    const error = await new HttpMcpClient(url, KEY).connect().catch((e: Error) => e);
    expect((error as Error).message).toMatch(/rejected the credentials/);
    expect((error as Error).message).not.toContain(KEY.keySecret);
  });
  it("times out with a TimeoutError", async () => {
    state.hang = true;
    const client = new HttpMcpClient(url, KEY, { timeoutMs: 150 });
    await client.connect();
    await expect(client.callRawTool("create_payment_link", {})).rejects.toMatchObject({ name: "TimeoutError" });
  });
});

describe("the stdio client", () => {
  it("talks line-delimited JSON-RPC to a child and gets the key only through its environment", async () => {
    const script = path.join(dataDir, "fake-stdio.js");
    writeFileSync(script, `
const rl = require("readline").createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const m = JSON.parse(line);
  if (m.id === undefined) return;
  const result = m.method === "initialize" ? { serverInfo: { name: "fake", version: "9" } } : { tools: [{ name: "create_payment_link", inputSchema: { type: "object", properties: { keyIdSeen: { type: "string", description: process.env.RAZORPAY_KEY_ID || "" } } } }] };
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\\n");
});`);
    const args = [script, "visible-arg"];
    const client = new StdioMcpClient(process.execPath, args, { RAZORPAY_KEY_ID: KEY.keyId, RAZORPAY_KEY_SECRET: KEY.keySecret });
    await client.connect();
    const tools = await client.listRawTools();
    await client.close();
    expect(client.serverInfo.name).toBe("fake");
    expect(JSON.stringify(tools)).toContain(KEY.keyId);
    expect(args.join(" ")).not.toContain(KEY.keySecret);
  });
  it("times out when the child never answers", async () => {
    const client = new StdioMcpClient(process.execPath, ["-e", "setInterval(()=>{},1000)"], {}, 200);
    await expect(client.connect()).rejects.toMatchObject({ name: "TimeoutError" });
    await client.close();
  });
});

describe("configuration", () => {
  const good = { RAZORPAY_MCP_MODE: "remote", RAZORPAY_KEY_ID: KEY.keyId, RAZORPAY_KEY_SECRET: KEY.keySecret };
  it("connects only with a mode and a valid test key pair", () => {
    expect(mcpConnectionStatus(good)).toEqual({ connected: true, via: "remote" });
    expect(mcpConnectionStatus({})).toEqual({ connected: false, reason: "not_configured" });
    expect(mcpConnectionStatus({ ...good, RAZORPAY_KEY_ID: "rzp_live_abcdef123456" })).toEqual({ connected: false, reason: "live_key_refused" });
    expect(mcpConnectionStatus({ ...good, RAZORPAY_KEY_ID: undefined })).toEqual({ connected: false, reason: "missing_key" });
    expect(mcpConnectionStatus({ ...good, RAZORPAY_KEY_SECRET: "" })).toEqual({ connected: false, reason: "missing_secret" });
  });
  it("gives the unavailable transport unless fully configured, and refuses to be pointed elsewhere", () => {
    expect(mcpTransportFromEnv({})).toBeInstanceOf(UnavailableMcpTransport);
    expect(mcpTransportFromEnv({ ...good, RAZORPAY_KEY_ID: "rzp_live_abcdef123456" })).toBeInstanceOf(UnavailableMcpTransport);
    expect(mcpTransportFromEnv(good)).toBeInstanceOf(RazorpayMcpTransport);
    expect(RAZORPAY_REMOTE_MCP_URL).toBe("https://mcp.razorpay.com/mcp");
    // There is no environment variable for the endpoint: the key can only be sent to Razorpay's own host.
    expect(JSON.stringify(mcpTransportFromEnv({ ...good, RAZORPAY_MCP_URL: "https://evil.example" }))).not.toContain("evil.example");
  });
});

describe("an approved action through the real adapter and a fake Razorpay server", () => {
  const transport = () => new RazorpayMcpTransport(new HttpMcpClient(url, KEY, { timeoutMs: 400 }), TEST);
  const intentFor = async () => {
    const catalog = await transport().listTools();
    const binding = bindRazorpayCapabilities(catalog).bindings.createTestPaymentLink!;
    const intent = approveMcpIntent(createPaymentLinkIntent({ dealId: "hero", agreementId: "agr", agreementVersion: 1, termsHash: "a".repeat(64), merchantId: "merchant-pinecone", serverId: binding.serverId, toolName: binding.toolName, catalogHash: binding.catalogHash, inputSchemaHash: binding.inputSchemaHash, amountPaise: 2301000, currency: "INR", description: "Phase 1", reference: "agr-v1-line1-1", customer: { name: "Kestrel Lane Clinics" } }), "Merchant", "2026-10-08T12:00:00+05:30");
    await store.recordMcpIntent(intent);
    return intent;
  };
  it("creates exactly one link with notifications off, and a repeat creates none", async () => {
    const intent = await intentFor();
    const first = await executeMcpIntent(intent.id, transport(), "2026-10-08T12:00:01+05:30");
    const second = await executeMcpIntent(intent.id, transport(), "2026-10-08T12:00:02+05:30");
    expect(first).toMatchObject({ outcome: "succeeded", externalId: "plink_1" });
    expect(second).toEqual(first);
    expect(state.links).toHaveLength(1);
    const create = state.calls.filter((c) => c.name === "create_payment_link");
    expect(create).toHaveLength(1);
    expect(create[0]!.args).toMatchObject({ reference_id: "agr-v1-line1-1", notify_sms: false, notify_email: false, reminder_enable: false, amount: 2301000 });
    expect(JSON.stringify(await store.getMcpReceipt(intent.id))).not.toContain(KEY.keySecret);
  });
  it("marks a timed-out create unknown and reconciles by reference, never creating a second link", async () => {
    const intent = await intentFor();
    state.hang = true;
    const first = await executeMcpIntent(intent.id, transport(), "2026-10-08T12:00:01+05:30");
    expect(first.outcome).toBe("unknown");
    // The server did create the link before the connection stalled.
    state.hang = false;
    state.links.push({ id: "plink_77", short_url: "https://rzp.io/i/77", status: "created", reference_id: "agr-v1-line1-1" });
    const reconciled = await executeMcpIntent(intent.id, transport(), "2026-10-08T12:00:09+05:30");
    expect(reconciled).toMatchObject({ outcome: "succeeded", externalId: "plink_77" });
    expect(state.calls.filter((c) => c.name === "create_payment_link")).toHaveLength(1);
  });
  it("refuses to execute when the server's own schema changed after approval", async () => {
    const intent = await intentFor();
    const tool = state.tools[0] as { inputSchema: { properties: Record<string, unknown> } };
    tool.inputSchema.properties.surprise = { type: "string" };
    await expect(executeMcpIntent(intent.id, transport(), "2026-10-08T12:00:01+05:30")).rejects.toThrow(/stale/i);
    expect(state.calls.filter((c) => c.name === "create_payment_link")).toHaveLength(0);
  });
});
