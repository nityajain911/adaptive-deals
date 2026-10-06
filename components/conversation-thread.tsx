import Link from "next/link";
import type { ReactNode } from "react";
import { MessageCircle } from "lucide-react";
import type { ConversationItem } from "@/domain/conversation";
import { clarificationDraftLabel, taskOrRunProvenance } from "@/lib/model-provenance";
import type { Message } from "@/domain/types";
import type { DemoState } from "@/lib/service";
import { activeVersionOf, noticeReplyOutcome } from "@/lib/views";
import { chatHighlights } from "@/lib/chat-highlights";
import { ChatScroll } from "./chat/chat-scroll";
import { HighlightedText } from "./chat/highlighted-text";
import { fmtTime } from "./evidence";
import { Badge, cx, type Tone } from "./ui";

/**
 * The simulated conversation, scoped to a stage (spec §4, §6.1). It is an input surface only:
 * no scripted replies, typed composer or pause control appear here (those are demo controls).
 */
const KIND: Record<ConversationItem["kind"], string> = {
  clarification: "Question",
  proposal: "Proposal",
  notice: "Advance notice",
  payment: "Payment",
  amendment: "Revised proposal",
  buyer_reply: "Reply",
  change_request: "Change request (proposal page)",
  decline: "Declined (proposal page)",
};
const STATE_TONE: Record<ConversationItem["state"], Tone> = {
  suggested_by_ai: "blue",
  drafted_by_code: "neutral",
  approved_and_sent_by_merchant: "green",
  sent_by_adaptive_deals: "neutral",
  received_from_buyer: "amber",
};

function linkify(text: string): ReactNode[] {
  return text.split(/(\/proposal\/[a-z0-9-]+\/v\d+)/i).map((part, i) =>
    /^\/proposal\//.test(part) ? (
      <Link key={i} href={part} className="font-semibold text-blue underline underline-offset-2">
        {part}
      </Link>
    ) : (
      part
    ),
  );
}

export function ConversationThread({ s, scope, buyerName, opening = [], compact = 2 }: { s: DemoState; scope: "understand" | "track"; buyerName: string; opening?: Message[]; compact?: number }) {
  // Draft badges follow who actually produced this run's clarification wording.
  const provenance = taskOrRunProvenance(s.run.record, "clarify", s.run.viewing);
  const byId = new Map(s.conversation.map((i) => [i.id, i]));
  const rootKind = (i: ConversationItem) => (i.inReplyTo ? byId.get(i.inReplyTo)?.kind : i.kind);
  const inScope = (i: ConversationItem) => {
    const k = rootKind(i);
    return scope === "understand" ? k === "clarification" : k === "proposal" || k === "payment" || k === "notice" || k === "amendment";
  };
  const items = s.conversation.filter(inScope);
  const activeV = activeVersionOf(s.agreements)?.version ?? null;
  const openingChronological = [...opening].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const shown = scope === "track" ? items.slice(-compact) : items;
  const hidden = scope === "track" ? items.slice(0, Math.max(0, items.length - compact)) : [];

  const highlights = chatHighlights(s.run.record.engine.profile, s.run.record.engine.rejectedFields, opening);
  const sentItems = shown.filter((i) => i.direction !== "outbound" || i.sentAt);
  const drafts = scope === "understand" ? shown.filter((i) => i.direction === "outbound" && !i.sentAt) : [];

  const bubbleShell = (side: "left" | "right", testId: string, children: ReactNode, extra?: Record<string, string>) => (
    <li key={testId} className={cx("max-w-[88%] rounded-lg px-3 py-2 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]", side === "right" ? "ml-auto rounded-tr-none bg-[#d9fdd3]" : "rounded-tl-none bg-white")} data-testid={testId} data-side={side} {...extra}>
      {children}
    </li>
  );

  const bubble = (i: ConversationItem) => {
    const outbound = i.direction === "outbound";
    const target = i.inReplyTo ? byId.get(i.inReplyTo) : null;
    const outcome = !outbound && target?.kind === "notice" ? noticeReplyOutcome(i, s, activeV) : null;
    const disposition = !outbound ? [...s.workDispositions].reverse().find((d) => d.sourceKind === "message" && d.sourceId === i.id) : null;
    const draft = outbound && !i.sentAt;
    return bubbleShell(
      outbound ? "right" : "left",
      `thread-${i.id}`,
      <>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
          <span className="font-semibold text-ink-2">{outbound ? KIND[i.kind] : buyerName}</span>
          {outbound ? <Badge tone={STATE_TONE[i.state]}>{draft ? "Draft · not sent" : clarificationDraftLabel(i.state, provenance)}</Badge> : null}
          {outbound && draft ? <Badge tone={STATE_TONE[i.state]}>{clarificationDraftLabel(i.state, provenance)}</Badge> : null}
          {!outbound && i.source === "buyer_proposal_page" ? <span>From the buyer proposal page</span> : null}
        </div>
        <p className="mt-1 text-[15px] leading-6 text-ink [overflow-wrap:anywhere]">{outbound ? linkify(i.text) : i.text}</p>
        <div className="mt-1 text-right text-[13px] text-muted">{fmtTime(i.sentAt ?? i.createdAt)}</div>
        {outcome ? (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px]" data-testid={`outcome-${i.id}`} data-outcome={outcome.label}>
            <Badge tone={outcome.tone}>{outcome.label}</Badge>
            <span className="text-muted">Read by code (reply-rules.v1), not AI · {outcome.detail}</span>
          </div>
        ) : null}
        {disposition ? (
          <div className="mt-1 text-[13px] text-muted" data-testid={`disposition-${i.id}`}>
            Merchant decision: {disposition.kind === "keep_current_terms" ? "Keep current terms" : disposition.kind === "handled_outside" ? "Handled outside Adaptive Deals" : "Follow-up still pending"}
            {disposition.note ? ` · ${disposition.note}` : ""}
          </div>
        ) : null}
      </>,
      { "data-kind": i.kind },
    );
  };

  const openingBubble = (message: Message) => {
    const buyer = message.author === "buyer";
    return bubbleShell(
      buyer ? "left" : "right",
      `message-${message.id}`,
      <>
        <div className="text-[13px] font-semibold text-ink-2">{buyer ? buyerName : "Pinecone Media Works"}</div>
        {buyer && highlights.get(message.id)?.length ? <HighlightedText text={message.text} highlights={highlights.get(message.id)!} /> : <p className="mt-1 text-[15px] leading-6 text-ink [overflow-wrap:anywhere]">{message.text}</p>}
        <div className="mt-1 text-right text-[13px] text-muted">{fmtTime(message.timestamp)}</div>
      </>,
    );
  };

  return (
    <section aria-labelledby={`thread-${scope}`} className="h-fit overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface" data-testid={`thread-${scope}`} data-walkthrough={scope === "understand" ? "buyer-conversation" : undefined}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <h2 id={`thread-${scope}`} className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <MessageCircle aria-hidden className="h-4 w-4 text-green" /> {buyerName}
        </h2>
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[13px] text-ink-2">Simulated conversation</span>
      </div>
      <ChatScroll label="Messages">
        {openingChronological.map(openingBubble)}
        {sentItems.map(bubble)}
        {!openingChronological.length && !sentItems.length ? <li className="text-[13px] text-muted">No messages yet.</li> : null}
      </ChatScroll>
      {hidden.length ? (
        <details className="border-t border-line px-5 py-3">
          <summary className="cursor-pointer text-[13px] font-semibold text-blue">Show full conversation</summary>
          <ol className="mt-3 space-y-2 bg-[#efeae2] p-3" aria-label="Earlier messages">
            {hidden.map(bubble)}
          </ol>
        </details>
      ) : null}
      {drafts.length ? (
        <div className="border-t border-line bg-[#f0f2f5] p-3" data-testid="chat-composer">
          <ol className="space-y-2">{drafts.map(bubble)}</ol>
        </div>
      ) : null}
    </section>
  );
}
