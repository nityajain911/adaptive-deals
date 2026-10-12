import type { ChatHighlight } from "@/lib/chat-highlights";

/** The key a fact uses to find its sentence in the chat: the message and the exact span of the buyer's words. */
export const evidenceKey = (messageId: string, start: number, end: number) => `${messageId}:${start}-${end}`;

/**
 * A buyer message with the phrases the constraints came from marked in place but not painted. A phrase lights up only
 * when the merchant points at the fact it supports (see ConstraintList), so the conversation reads as a conversation.
 */
export function HighlightedText({ messageId, text, highlights }: { messageId: string; text: string; highlights: ChatHighlight[] }) {
  const parts: React.ReactNode[] = [];
  let pos = 0;
  highlights.forEach((h, i) => {
    if (h.start > pos) parts.push(text.slice(pos, h.start));
    parts.push(
      <span key={i} data-testid="chat-highlight" data-kind={h.kind} data-ev-key={h.kind === "rejected" ? `rejected:${messageId}` : evidenceKey(messageId, h.start, h.end)} className="rounded-[3px] transition-colors">
        {text.slice(h.start, h.end)}
      </span>,
    );
    pos = h.end;
  });
  parts.push(text.slice(pos));
  return <p className="text-[15px] leading-6 text-ink [overflow-wrap:anywhere]">{parts}</p>;
}
