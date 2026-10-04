import Link from "next/link";
import type { ReactNode } from "react";
import { MessageCircle } from "lucide-react";
import { STATE_LABEL, type ConversationItem } from "@/domain/conversation";
import type { Message } from "@/domain/types";
import type { DemoState } from "@/lib/service";
import { activeVersionOf, noticeReplyOutcome } from "@/lib/views";
import { fmtTime } from "./evidence";
import { Badge, Pill, cx, type Tone } from "./ui";

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

export function ConversationThread({ s, scope, opening = [], compact = 2 }: { s: DemoState; scope: "understand" | "track"; opening?: Message[]; compact?: number }) {
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

  const bubble = (i: ConversationItem) => {
    const outbound = i.direction === "outbound";
    const target = i.inReplyTo ? byId.get(i.inReplyTo) : null;
    const outcome = !outbound && target?.kind === "notice" ? noticeReplyOutcome(i, s, activeV) : null;
    const disposition = !outbound ? [...s.workDispositions].reverse().find((d) => d.sourceKind === "message" && d.sourceId === i.id) : null;
    return (
      <li key={i.id} className={cx("max-w-[92%] rounded-2xl border px-4 py-3", outbound ? cx("ml-auto", i.sentAt ? "border-[#d6defe] bg-blue-weak" : "border-dashed border-[#9fb3ff] bg-surface") : "border-line bg-surface")} data-testid={`thread-${i.id}`} data-kind={i.kind}>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <span className="font-semibold text-ink-2">{outbound ? KIND[i.kind] : "Buyer · Kestrel Lane Clinics"}</span>
          <Badge tone={STATE_TONE[i.state]}>{STATE_LABEL[i.state]}</Badge>
          {!outbound ? <Pill>{i.source === "buyer_proposal_page" ? "From the buyer proposal page" : "Simulated buyer reply"}</Pill> : null}
          <Pill>{fmtTime(i.sentAt ?? i.createdAt)}</Pill>
        </div>
        <p className="mt-1.5 text-[14px] leading-6 text-ink [overflow-wrap:anywhere]">{outbound ? linkify(i.text) : i.text}</p>
        {outcome ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]" data-testid={`outcome-${i.id}`} data-outcome={outcome.label}>
            <Badge tone={outcome.tone}>{outcome.label}</Badge>
            <span className="text-muted">Read by code (reply-rules.v1), not AI · {outcome.detail}</span>
          </div>
        ) : null}
        {disposition ? (
          <div className="mt-2 text-[12px] text-muted" data-testid={`disposition-${i.id}`}>
            Merchant decision: {disposition.kind === "keep_current_terms" ? "Keep current terms" : disposition.kind === "handled_outside" ? "Handled outside Adaptive Deals" : "Follow-up still pending"}
            {disposition.note ? ` · ${disposition.note}` : ""}
          </div>
        ) : null}
      </li>
    );
  };

  const openingBubble = (message: Message) => {
    const buyer = message.author === "buyer";
    return (
      <li key={message.id} className={cx("max-w-[92%] rounded-2xl border px-4 py-3", buyer ? "border-line bg-surface" : "ml-auto border-[#d6defe] bg-blue-weak")} data-testid={`message-${message.id}`}>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <span className="font-semibold text-ink-2">{buyer ? "Buyer · Kestrel Lane Clinics" : "Merchant · Pinecone Media Works"}</span>
          {buyer ? <Badge tone="amber">Received from buyer</Badge> : <Badge tone="green">Sent by merchant</Badge>}
          <Pill>Simulated WhatsApp conversation</Pill>
          <Pill>{fmtTime(message.timestamp)}</Pill>
        </div>
        <p className="mt-1.5 text-[14px] leading-6 text-ink [overflow-wrap:anywhere]">{message.text}</p>
      </li>
    );
  };

  return (
    <section aria-labelledby={`thread-${scope}`} className="rounded-[var(--radius-card)] border border-line bg-surface" data-testid={`thread-${scope}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <h2 id={`thread-${scope}`} className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <MessageCircle aria-hidden className="h-4 w-4 text-green" /> {scope === "understand" ? "Conversation" : "Conversation since the offer"}
        </h2>
        <span className="text-[12px] text-muted">WhatsApp simulated · buyer replies selected by the demo operator</span>
      </div>
      <ol className="space-y-3 p-5" aria-label="Messages">
        {openingChronological.map(openingBubble)}
        {shown.map(bubble)}
        {!openingChronological.length && !shown.length ? <li className="text-[13px] text-muted">No messages yet.</li> : null}
      </ol>
      {hidden.length ? (
        <details className="border-t border-line px-5 py-3">
          <summary className="cursor-pointer text-[13px] font-semibold text-blue">Show full conversation</summary>
          <ol className="mt-3 space-y-3" aria-label="Earlier messages">
            {hidden.map(bubble)}
          </ol>
        </details>
      ) : null}
    </section>
  );
}
