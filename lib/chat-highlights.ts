import type { FieldCard } from "@/ai/run-record";
import type { ConstraintProfile, Message } from "@/domain/types";

/** One highlighted phrase in a buyer message, with what the code understood from it. */
export interface ChatHighlight {
  start: number;
  end: number;
  kind: "evidence" | "rejected";
  label: string;
  detail: string;
  normalisation: string | null;
}

/**
 * Highlights for the conversation, built from stored evidence only. Stored offsets are used only
 * when they still reproduce the stored quote; a phrase the code could not map is located in the
 * buyer's own messages. Overlapping spans keep the earlier one.
 */
export function chatHighlights(profile: FieldCard[], rejected: ConstraintProfile["rejectedFields"], messages: Message[]): Map<string, ChatHighlight[]> {
  const byMessage = new Map<string, ChatHighlight[]>();
  const add = (messageId: string, h: ChatHighlight) => byMessage.set(messageId, [...(byMessage.get(messageId) ?? []), h]);
  for (const f of profile) {
    for (const e of f.evidence) {
      const m = messages.find((x) => x.id === e.messageId);
      if (!m || m.text.slice(e.start, e.end) !== e.quote) continue;
      add(m.id, { start: e.start, end: e.end, kind: "evidence", label: f.label, detail: f.display ?? "", normalisation: f.transformation });
    }
  }
  for (const r of rejected) {
    if (!r.rawText) continue;
    const m = messages.find((x) => x.author === "buyer" && x.text.includes(r.rawText!));
    if (!m) continue;
    const start = m.text.indexOf(r.rawText);
    add(m.id, { start, end: start + r.rawText.length, kind: "rejected", label: "Not matched to a service", detail: r.reason, normalisation: null });
  }
  for (const [id, list] of byMessage) {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    byMessage.set(id, sorted.filter((h, i) => i === 0 || h.start >= sorted[i - 1].end));
  }
  return byMessage;
}

/** The buyer's own words behind the budget, only when the stored offsets reproduce the quote. */
export function buyerBudgetQuote(profile: FieldCard[], messages: Message[]): { quote: string; messageId: string } | null {
  const budget = profile.find((f) => f.key === "budgetNow");
  for (const e of budget?.evidence ?? []) {
    const m = messages.find((x) => x.id === e.messageId && x.author === "buyer");
    if (m && m.text.slice(e.start, e.end) === e.quote) return { quote: e.quote, messageId: m.id };
  }
  return null;
}
