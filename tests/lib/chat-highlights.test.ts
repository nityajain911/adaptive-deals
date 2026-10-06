import { describe, expect, it } from "vitest";
import { chatHighlights } from "@/lib/chat-highlights";
import type { FieldCard } from "@/ai/run-record";
import type { Message } from "@/domain/types";

const message = (id: string, text: string, author: "buyer" | "merchant" = "buyer"): Message => ({ id, dealId: "d", author, text, timestamp: "2026-10-01T10:00:00+05:30", source: "whatsapp" }) as Message;
const field = (over: Partial<FieldCard>): FieldCard => ({ key: "budgetNow", label: "Budget available now", status: "stated", display: "₹50,000", rawText: "50K", evidence: [], transformation: "50K → ₹50,000", confidence: "high", note: null, confirmedBy: null, ...over });

describe("chat highlights", () => {
  const m = message("m1", "Only ₹50K left this quarter, and we cannot take the complete annual package.");

  it("marks stored evidence at its stored offsets and says what was understood", () => {
    const start = m.text.indexOf("₹50K left this quarter");
    const map = chatHighlights([field({ evidence: [{ quote: "₹50K left this quarter", messageId: "m1", start, end: start + 22 }] })], [], [m]);
    expect(map.get("m1")).toEqual([{ start, end: start + 22, kind: "evidence", label: "Budget available now", detail: "₹50,000", normalisation: "50K → ₹50,000" }]);
  });

  it("ignores evidence whose offsets do not reproduce the stored quote", () => {
    const map = chatHighlights([field({ evidence: [{ quote: "₹50K left this quarter", messageId: "m1", start: 3, end: 25 }] })], [], [m]);
    expect(map.has("m1")).toBe(false);
  });

  it("marks a phrase the code could not map in its own kind, found in a buyer message", () => {
    const map = chatHighlights([], [{ key: "required_package", reason: "does not match a deal package", rawText: "complete annual package" }], [message("m0", "Sharing our proposal", "merchant"), m]);
    const at = m.text.indexOf("complete annual package");
    expect(map.get("m1")).toEqual([{ start: at, end: at + "complete annual package".length, kind: "rejected", label: "Not matched to a service", detail: "does not match a deal package", normalisation: null }]);
    expect(map.has("m0")).toBe(false);
  });

  it("drops overlaps, keeping the earlier span, and skips rejected phrases that are not in any message", () => {
    const a = m.text.indexOf("₹50K");
    const map = chatHighlights(
      [field({ evidence: [{ quote: "₹50K left", messageId: "m1", start: a, end: a + 9 }] }), field({ key: "x", label: "Other", evidence: [{ quote: "K left this", messageId: "m1", start: a + 3, end: a + 14 }] })],
      [{ key: "k", reason: "r", rawText: "not present anywhere" }],
      [m],
    );
    expect(map.get("m1")).toHaveLength(1);
  });
});

describe("what the buyer said, beside the offer", () => {
  const m = message("m1", "We have ₹50,000 left this quarter and new budget opens in April.");
  it("returns the buyer's own budget sentence span, verified against the message", async () => {
    const { buyerBudgetQuote } = await import("@/lib/chat-highlights");
    const start = m.text.indexOf("₹50,000 left this quarter");
    const f = field({ evidence: [{ quote: "₹50,000 left this quarter", messageId: "m1", start, end: start + 25 }] });
    expect(buyerBudgetQuote([f], [m])).toEqual({ quote: "₹50,000 left this quarter", messageId: "m1" });
    expect(buyerBudgetQuote([{ ...f, evidence: [{ quote: "₹50,000 left this quarter", messageId: "m1", start: 0, end: 25 }] }], [m])).toBeNull();
    expect(buyerBudgetQuote([], [m])).toBeNull();
  });
});
