/**
 * SYNTHETIC failure-state scenarios for the live product's "Try another conversation" panel.
 * Each pairs a fictional buyer message with hand-written AI-shaped output (labelled Synthetic
 * replay). The state shown is computed by the real engine, never stored here.
 */
import type { ExtractionOutput } from "@/ai/schemas";
import type { Message } from "@/domain/types";

export interface Scenario {
  id: string;
  title: string;
  summary: string;
  messages: Message[];
  extraction: ExtractionOutput;
}

const msg = (dealId: string, text: string, timestamp: string): Message => ({ id: "s-msg-1", dealId, author: "buyer", text, timestamp, source: "whatsapp" });
const f = (key: ExtractionOutput["fields"][number]["key"], raw_text: string, evidence_quote: string) => ({ key, raw_text, evidence_quote, message_id: "s-msg-1", confidence: "high" as const });
const empty: ExtractionOutput = { fields: [], ambiguities: [], missing_required: [], unsupported_requests: [], suspected_instructions: [] };

const NO_FEASIBLE = "Only ₹5K left this quarter including GST; new budget in April; we must start before December.";
const OUTSIDE = "We have ₹40K this quarter including GST, but can you take part of it as a revenue share on new patient bookings instead?";
const INSUFFICIENT = "Can we start in January? Payments can be split into parts.";

export const SCENARIOS: Scenario[] = [
  {
    id: "scenario-insufficient",
    title: "Insufficient information",
    summary: "The buyer asks to split payments but never states a budget.",
    messages: [msg("scenario-insufficient", INSUFFICIENT, "2026-10-01T10:00:00+05:30")],
    extraction: { ...empty, missing_required: ["budget_now_amount", "budget_now_period"] },
  },
  {
    id: "scenario-outside",
    title: "Outside supported templates",
    summary: "The buyer asks for a revenue share, which none of the four templates can represent.",
    messages: [msg("scenario-outside", OUTSIDE, "2026-10-01T10:00:00+05:30")],
    extraction: {
      ...empty,
      fields: [f("budget_now_amount", "₹40K", "We have ₹40K this quarter including GST"), f("budget_now_period", "this quarter", "We have ₹40K this quarter including GST"), f("amounts_include_gst", "including GST", "We have ₹40K this quarter including GST")],
      unsupported_requests: [{ raw_text: "revenue share on new patient bookings", evidence_quote: "can you take part of it as a revenue share on new patient bookings instead?", message_id: "s-msg-1", kind: "revenue_share" }],
    },
  },
  {
    id: "scenario-no-feasible",
    title: "No feasible deal",
    summary: "₹5K this quarter, nothing until April, and the work must start before December.",
    messages: [msg("scenario-no-feasible", NO_FEASIBLE, "2026-10-01T10:00:00+05:30")],
    extraction: {
      ...empty,
      fields: [
        f("budget_now_amount", "₹5K", "Only ₹5K left this quarter including GST"),
        f("budget_now_period", "this quarter", "Only ₹5K left this quarter including GST"),
        f("amounts_include_gst", "including GST", "Only ₹5K left this quarter including GST"),
        f("next_budget_date", "April", "new budget in April"),
        f("latest_start", "December", "we must start before December"),
      ],
    },
  },
];
