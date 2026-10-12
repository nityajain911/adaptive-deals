/**
 * What Razorpay's hosted MCP server offers for each part of a deal, and what this prototype does with it.
 * The tool names are the ones the server advertised in the read-only discovery of 9 October 2026
 * (`evaluation-assist/results/mcp-discovery-2026-10-09.json`, 42 tools, test key, no tool called); a test checks every
 * name against that file, so this table cannot drift from what was observed. Nothing here calls Razorpay.
 */
export type McpMapStatus = "implemented" | "simulated" | "not_used";

export interface McpCapabilityRow {
  id: "collection" | "mandate" | "debits" | "reporting";
  part: string;
  /** Tools the server advertised that belong to this part. */
  tools: string[];
  status: McpMapStatus;
  /** What the product does today, in plain words. */
  today: string;
  /** What is not claimed. */
  limit?: string;
}

export const MCP_DISCOVERY = { observedAt: "2026-10-09", toolCount: 42, via: "Razorpay's hosted MCP server, test key, read-only" } as const;

/** The per-link amounts seen in test mode on 9 October 2026 (`mcp-first-test-link-2026-10-09.json`). */
export const MCP_TEST_LINK = { createdUpToPaise: 1_500_000, refusedFromPaise: 2_000_000, observedAt: "2026-10-09" } as const;

export const MCP_CAPABILITY_MAP: McpCapabilityRow[] = [
  {
    id: "collection",
    part: "Upfront collection",
    tools: ["create_payment_link", "fetch_payment_link", "fetch_all_payment_links", "update_payment_link", "payment_link_notify"],
    status: "implemented",
    today: "After the buyer accepts and you approve the exact link, creates one test Payment Link for the first payment (notifications always off). It can call only create_payment_link and fetch_all_payment_links, and reads a link's status with fetch_payment_link.",
    limit: "Test mode only. Razorpay's test account refused links of ₹20,000 and above, including the ₹23,010 hero payment, so that payment stays simulated.",
  },
  {
    id: "mandate",
    part: "Auto-pay mandate",
    tools: ["create_registration_link", "fetch_tokens", "revoke_token"],
    status: "simulated",
    today: "The mandate is a labelled simulation. None of these tools is called.",
    limit: "A real mandate needs a recurring-enabled test account and the buyer's bank or UPI approval. The registration-link tool's parameters have not been inspected, so it is a planned next step, not something this prototype does.",
  },
  {
    id: "debits",
    part: "Later debits",
    tools: [],
    status: "simulated",
    today: "Each debit, retry and failure is a labelled simulation.",
    limit: "No tool for charging a saved mandate was identified among the advertised tools. Razorpay's Subscriptions API is not among them either, so this prototype does not claim it.",
  },
  {
    id: "reporting",
    part: "Reporting and reconciliation",
    tools: ["fetch_payment", "fetch_all_payments", "fetch_all_settlements", "fetch_settlement_with_id", "fetch_all_refunds"],
    status: "not_used",
    today: "Only the status of a Payment Link is read. Payments, settlements and refunds are not read.",
  },
];

/** A note for the Payment Link review card when the amount is above what test mode accepted. */
export function paymentLinkPreflight(amountPaise: number): string | null {
  if (amountPaise < MCP_TEST_LINK.refusedFromPaise) return null;
  return `Razorpay's test account refused links of ₹${(MCP_TEST_LINK.refusedFromPaise / 100).toLocaleString("en-IN")} and above on ${MCP_TEST_LINK.observedAt.split("-").reverse().join(" ")}, and accepted up to ₹${(MCP_TEST_LINK.createdUpToPaise / 100).toLocaleString("en-IN")}. This link may fail. The simulated payment path is unaffected.`;
}
