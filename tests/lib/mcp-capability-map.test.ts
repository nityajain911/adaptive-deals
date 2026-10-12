import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MCP_CAPABILITY_MAP, MCP_DISCOVERY, MCP_TEST_LINK, paymentLinkPreflight } from "@/lib/mcp-capability-map";

const discovery = JSON.parse(readFileSync("evaluation-assist/results/mcp-discovery-2026-10-09.json", "utf8")) as { observedAt: string; toolsAdvertised: string[]; toolCallsMade: number };
const linkTests = JSON.parse(readFileSync("evaluation-assist/results/mcp-first-test-link-2026-10-09.json", "utf8")) as { calls: { amountPaise: number; outcome: string }[] };

describe("the Razorpay MCP capability map", () => {
  it("names only tools the server actually advertised in the recorded discovery", () => {
    expect(discovery.toolCallsMade).toBe(0);
    expect(MCP_DISCOVERY.toolCount).toBe(discovery.toolsAdvertised.length);
    for (const row of MCP_CAPABILITY_MAP) for (const tool of row.tools) expect(discovery.toolsAdvertised, `${tool} in ${row.id}`).toContain(tool);
  });

  it("does not claim the Subscriptions API, which the server did not advertise", () => {
    expect(discovery.toolsAdvertised.some((tool) => /subscription|plan/i.test(tool))).toBe(false);
    const text = JSON.stringify(MCP_CAPABILITY_MAP);
    expect(text).not.toMatch(/triggers .*subscriptions api/i);
    expect(MCP_CAPABILITY_MAP.find((row) => row.id === "debits")!.limit).toMatch(/does not claim it/);
  });

  it("marks only the Payment Link part as implemented, and the mandate and debits as simulated", () => {
    expect(MCP_CAPABILITY_MAP.filter((row) => row.status === "implemented").map((row) => row.id)).toEqual(["collection"]);
    expect(MCP_CAPABILITY_MAP.find((row) => row.id === "mandate")!.status).toBe("simulated");
    expect(MCP_CAPABILITY_MAP.find((row) => row.id === "debits")!.status).toBe("simulated");
  });

  it("states the observed per-link limits exactly as recorded", () => {
    const worked = linkTests.calls.filter((call) => call.outcome === "succeeded").map((call) => call.amountPaise);
    const refused = linkTests.calls.filter((call) => call.outcome === "failed").map((call) => call.amountPaise);
    expect(Math.max(...worked)).toBe(MCP_TEST_LINK.createdUpToPaise);
    expect(Math.min(...refused)).toBe(MCP_TEST_LINK.refusedFromPaise);
  });

  it("warns only for an amount in the range test mode refused", () => {
    expect(paymentLinkPreflight(1_500_000)).toBeNull();
    expect(paymentLinkPreflight(1_999_900)).toBeNull();
    expect(paymentLinkPreflight(2_301_000)).toMatch(/refused links of ₹20,000 and above.*accepted up to ₹15,000.*simulated payment path is unaffected/);
  });
});
