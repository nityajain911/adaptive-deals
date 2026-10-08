import { describe, expect, it } from "vitest";
import { bindRazorpayCapabilities } from "@/mcp/capabilities";
import { adaptRazorpayCatalog, RazorpayMcpTransport, toRealCreateArgs } from "@/mcp/razorpay-adapter";
import type { McpWireClient, RawCallResult, RealTool } from "@/mcp/jsonrpc";
import { checkRazorpayKey } from "@/integrations/razorpay/keys";
import { REAL_CREATE_TOOL, REAL_FETCH_ALL_TOOL, REAL_FETCH_TOOL, REAL_REFUND_TOOL } from "./helpers/fake-razorpay-mcp";

const TEST = checkRazorpayKey("rzp_test_abcdef123456", "secret");
const LIVE = checkRazorpayKey("rzp_live_abcdef123456", "secret");
const server = { name: "razorpay-mcp-server", version: "1.2.3" };
const tools = [REAL_CREATE_TOOL, REAL_FETCH_ALL_TOOL, REAL_FETCH_TOOL, REAL_REFUND_TOOL] as RealTool[];

describe("the real catalog binds only when everything we rely on is advertised", () => {
  it("binds create and fetch-by-reference on a test key, and exposes no other tool", () => {
    const catalog = adaptRazorpayCatalog(tools, server, TEST);
    expect(catalog.mode).toBe("test");
    expect((catalog.tools as { name: string }[]).map((t) => t.name)).toEqual(["create_payment_link", "fetch_all_payment_links"]);
    const bound = bindRazorpayCapabilities(catalog);
    expect(bound.status).toBe("compatible");
    expect(bound.bindings.createTestPaymentLink?.toolName).toBe("create_payment_link");
    expect(bound.bindings.fetchPaymentLink?.toolName).toBe("fetch_all_payment_links");
  });
  it("refuses a live key", () => {
    expect(bindRazorpayCapabilities(adaptRazorpayCatalog(tools, server, LIVE)).status).toBe("refused");
    expect(bindRazorpayCapabilities(adaptRazorpayCatalog(tools, server, checkRazorpayKey(undefined, undefined))).status).toBe("refused");
  });
  it("does not bind create when a notification switch is missing", () => {
    for (const missing of ["notify_sms", "notify_email", "reminder_enable", "reference_id"]) {
      const props = { ...REAL_CREATE_TOOL.inputSchema.properties } as Record<string, unknown>;
      delete props[missing];
      const catalog = adaptRazorpayCatalog([{ ...REAL_CREATE_TOOL, inputSchema: { ...REAL_CREATE_TOOL.inputSchema, properties: props } }, REAL_FETCH_ALL_TOOL] as RealTool[], server, TEST);
      expect(bindRazorpayCapabilities(catalog).status, missing).toBe("unsupported");
    }
  });
  it("is unsupported when the server advertises no create tool, and never guesses another name", () => {
    expect(bindRazorpayCapabilities(adaptRazorpayCatalog([REAL_REFUND_TOOL, REAL_FETCH_TOOL] as RealTool[], server, TEST)).status).toBe("unsupported");
  });
  it("changes the catalog hash, and so invalidates approval, when the server changes its own schema", () => {
    const before = bindRazorpayCapabilities(adaptRazorpayCatalog(tools, server, TEST)).bindings.createTestPaymentLink!;
    const changed = { ...REAL_CREATE_TOOL, inputSchema: { ...REAL_CREATE_TOOL.inputSchema, properties: { ...REAL_CREATE_TOOL.inputSchema.properties, extra: { type: "string" } } } };
    const after = bindRazorpayCapabilities(adaptRazorpayCatalog([changed, REAL_FETCH_ALL_TOOL] as RealTool[], server, TEST)).bindings.createTestPaymentLink!;
    expect(after.inputSchemaHash).not.toBe(before.inputSchemaHash);
    expect(after.catalogHash).not.toBe(before.catalogHash);
  });
});

describe("arguments are mapped by us, with notifications always off", () => {
  const canonical = { amount: 2301000, currency: "INR", description: "Adaptive Deals agr v1", reference: "agr-v1-line1-1", idempotency_key: "ad_" + "a".repeat(32), customer: { name: "Kestrel Lane Clinics", email: "x@example.invalid", contact: "+910000000000" } };
  it("maps to the server's parameter names and never forwards contact details", () => {
    const real = toRealCreateArgs(canonical);
    expect(real).toMatchObject({ amount: 2301000, currency: "INR", reference_id: "agr-v1-line1-1", customer_name: "Kestrel Lane Clinics", notify_sms: false, notify_email: false, reminder_enable: false });
    expect(JSON.stringify(real)).not.toMatch(/example\.invalid|\+9100/);
  });
  it("refuses a reference that Razorpay would cut off, a non-INR currency and an invalid amount", () => {
    expect(() => toRealCreateArgs({ ...canonical, reference: "x".repeat(41) })).toThrow(/reference/i);
    expect(() => toRealCreateArgs({ ...canonical, currency: "USD" })).toThrow(/INR/);
    expect(() => toRealCreateArgs({ ...canonical, amount: 50 })).toThrow(/amount/i);
    expect(() => toRealCreateArgs({ ...canonical, amount: 100.5 })).toThrow(/amount/i);
  });
});

describe("the transport", () => {
  const wire = (onCall: (name: string, args: Record<string, unknown>) => RawCallResult): McpWireClient & { calls: string[] } => ({
    calls: [] as string[], serverInfo: server,
    async connect() {}, async listRawTools() { return tools; }, async close() {},
    async callRawTool(name: string, args: Record<string, unknown>) { (this as { calls: string[] }).calls.push(name); return onCall(name, args); },
  });
  it("calls only the two permitted tools", async () => {
    const client = wire(() => ({ content: [{ text: "{}" }] }));
    const transport = new RazorpayMcpTransport(client, TEST);
    await expect(transport.callTool({ name: "create_refund", arguments: {} })).rejects.toThrow(/not permitted/);
    await expect(transport.callTool({ name: "fetch_payment_link", arguments: {} })).rejects.toThrow(/not permitted/);
    expect(client.calls).toEqual([]);
  });
  it("makes no call at all without a valid test key", async () => {
    const client = wire(() => ({ content: [{ text: "{}" }] }));
    await expect(new RazorpayMcpTransport(client, LIVE).callTool({ name: "create_payment_link", arguments: {} })).rejects.toThrow(/test key/);
    expect(client.calls).toEqual([]);
  });
  it("reads a link back by reference from the list response, and reports none when there is none", async () => {
    const link = { id: "plink_9", short_url: "https://rzp.io/i/9", status: "created", reference_id: "ref-1" };
    const found = await new RazorpayMcpTransport(wire(() => ({ content: [{ text: JSON.stringify({ payment_links: [{ ...link, reference_id: "other" }, link] }) }] })), TEST).callTool({ name: "fetch_all_payment_links", arguments: { reference: "ref-1" } });
    expect(found.structuredContent).toMatchObject({ id: "plink_9" });
    await expect(new RazorpayMcpTransport(wire(() => ({ content: [{ text: JSON.stringify({ payment_links: [] }) }] })), TEST).callTool({ name: "fetch_all_payment_links", arguments: { reference: "ref-1" } })).rejects.toThrow(/No Payment Link/);
  });
  it("passes a tool error through as an error result", async () => {
    const result = await new RazorpayMcpTransport(wire(() => ({ isError: true, content: [{ text: "boom" }] })), TEST).callTool({ name: "create_payment_link", arguments: { amount: 2301000, currency: "INR", description: "d", reference: "r1", idempotency_key: "ad_" + "b".repeat(32) } });
    expect(result.isError).toBe(true);
  });
});
