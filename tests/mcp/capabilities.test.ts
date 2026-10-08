import { describe, expect, it } from "vitest";
import { bindRazorpayCapabilities, catalogHash } from "@/mcp/capabilities";
import type { McpToolCatalog } from "@/mcp/types";

const paymentTool = {
  name: "provider_defined_create_link",
  description: "Create a Razorpay test Payment Link",
  metadata: { provider: "razorpay", environment: "test", capability: "create_payment_link" },
  inputSchema: {
    type: "object",
    properties: {
      amount: { type: "integer" }, currency: { type: "string" }, description: { type: "string" },
      reference: { type: "string" }, idempotency_key: { type: "string" }, customer: { type: "object" },
    },
    required: ["amount", "currency", "description", "reference", "idempotency_key"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: { id: { type: "string" }, short_url: { type: "string" }, status: { type: "string" } },
    required: ["id", "short_url", "status"], additionalProperties: true,
  },
};

const catalog = (tool: unknown = paymentTool): McpToolCatalog => ({
  serverId: "razorpay-local", serverVersion: "1.0", mode: "test", tools: [tool],
});

describe("Razorpay MCP capability discovery", () => {
  it("binds a compatible advertised test-mode capability without depending on its tool name", () => {
    const result = bindRazorpayCapabilities(catalog());
    expect(result).toMatchObject({ status: "compatible", catalogHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(result.bindings.createTestPaymentLink).toMatchObject({ toolName: "provider_defined_create_link", capability: "create_test_payment_link" });
  });

  it("returns unsupported when the catalog does not advertise the required capability", () => {
    const result = bindRazorpayCapabilities(catalog({ ...paymentTool, metadata: { provider: "razorpay", environment: "test", capability: "create_refund" } }));
    expect(result).toMatchObject({ status: "unsupported", bindings: {} });
  });

  it("refuses a non-test catalog even when its schema is compatible", () => {
    const result = bindRazorpayCapabilities({ ...catalog(), mode: "live", tools: [{ ...paymentTool, metadata: { ...paymentTool.metadata, environment: "live" } }] });
    expect(result).toMatchObject({ status: "refused", reason: expect.stringMatching(/test mode/i), bindings: {} });
  });

  it("fails closed for malformed catalogs and schemas", () => {
    expect(bindRazorpayCapabilities({ serverId: "bad", serverVersion: null, mode: "test", tools: [{ name: "x" }] })).toMatchObject({ status: "malformed", bindings: {} });
    expect(bindRazorpayCapabilities(catalog({ ...paymentTool, inputSchema: { ...paymentTool.inputSchema, required: ["amount"] } }))).toMatchObject({ status: "unsupported", bindings: {} });
  });

  it("hashes canonical catalog content rather than object key order", () => {
    expect(catalogHash(catalog())).toBe(catalogHash({ tools: [paymentTool], mode: "test", serverVersion: "1.0", serverId: "razorpay-local" }));
  });
});
