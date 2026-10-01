import Link from "next/link";
import type { ReactNode } from "react";
import { MessageCircle, Pause, Play } from "lucide-react";
import { CHANNEL_LABEL, STATE_LABEL, type ConversationItem } from "@/domain/conversation";
import { CLASSIFICATION_LABEL } from "@/domain/replies";
import type { Evidence, Message } from "@/domain/types";
import { heroScriptedReplies } from "@/data/synthetic/hero";
import type { DemoState } from "@/lib/service";
import { activeVersionOf, changeRequestDisplay, pendingActions } from "@/lib/views";
import { ActionButton, TypedReply } from "./client";
import { fmtTime, highlighted } from "./evidence";
import { Badge, Card, Pill, cx, type Tone } from "./ui";

const STATE_TONE: Record<ConversationItem["state"], Tone> = {
  suggested_by_ai: "blue",
  drafted_by_code: "neutral",
  approved_and_sent_by_merchant: "green",
  sent_by_adaptive_deals: "neutral",
  received_from_buyer: "amber",
};
const KIND_LABEL: Record<ConversationItem["kind"], string> = {
  clarification: "Clarification question",
  proposal: "Proposal",
  notice: "Advance notice",
  payment: "Payment",
  amendment: "Revised proposal",
  buyer_reply: "Reply",
  change_request: "Change request (proposal page)",
  decline: "Declined (proposal page)",
};
const AUTHOR: Record<ConversationItem["author"], string> = {
  ai: "Draft wording: AI",
  code: "Written by code from verified state",
  merchant: "Merchant",
  buyer: "Buyer · Kestrel Lane Clinics",
};

/** Turn proposal paths inside code-authored messages into links. */
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

type Scope = "all" | "after_agreement";

/**
 * The simulated WhatsApp thread between merchant and buyer. Pasted opening messages show the
 * evidence the AI cited; every later item shows its state, author, time and reply-to reference.
 * Buyer replies are chosen by the demo operator and read by code, never by AI.
 */
export function ConversationPanel({ s, messages = [], evidence = [], scope = "all", titleId = "conv" }: { s: DemoState; messages?: Message[]; evidence?: (Evidence & { label: string })[]; scope?: Scope; titleId?: string }) {
  const active = activeVersionOf(s.agreements);
  const byId = new Map(s.conversation.map((i) => [i.id, i]));
  const after = (i: ConversationItem) => {
    const root = i.inReplyTo ? byId.get(i.inReplyTo) : i;
    return !!root && (root.kind === "notice" || root.kind === "payment" || root.kind === "amendment");
  };
  const items = scope === "all" ? s.conversation : s.conversation.filter(after);
  const pending = pendingActions(s);
  const replyTargets = s.conversation.filter((i) => i.direction === "outbound" && i.sentAt && (scope === "all" || after(i)));
  const clarDrafts = s.conversation.filter((i) => i.kind === "clarification");
  const clarReplies = clarDrafts.map((d) => [...s.conversation].reverse().find((r) => r.inReplyTo === d.id));
  const canAdopt = s.status === "clarifying" && clarDrafts.length > 0 && clarDrafts.every((d) => d.sentAt) && clarReplies.every(Boolean);
  const typedAnswerMissing = canAdopt && clarReplies.some((r) => !r!.refs.answerValue);

  return (
    <Card aria-labelledby={titleId} data-testid={scope === "all" ? "conversation" : "conversation-after"}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <MessageCircle aria-hidden className="h-4 w-4 text-green" />
            {scope === "all" ? "Buyer conversation" : "Buyer conversation · after acceptance"}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
            <span className="rounded-full border border-[#ddd5ff] bg-violet-weak px-2 py-0.5 text-[12px] font-medium leading-5 text-violet" data-testid="channel-label">
              {CHANNEL_LABEL}
            </span>
            {scope === "all" ? <span>{pending.draftsToSend ? `${pending.draftsToSend} draft${pending.draftsToSend === 1 ? "" : "s"} waiting for you to send` : "Nothing is sent automatically"}</span> : null}
          </div>
        </div>
        {scope === "all" ? (
          <ActionButton body={{ action: "set_suggestions_paused", paused: !s.suggestionsPaused }} variant={s.suggestionsPaused ? "primary" : "secondary"} testId="pause-suggestions">
            {s.suggestionsPaused ? (
              <>
                <Play aria-hidden className="h-3.5 w-3.5" /> Resume suggested replies
              </>
            ) : (
              <>
                <Pause aria-hidden className="h-3.5 w-3.5" /> Pause suggested replies
              </>
            )}
          </ActionButton>
        ) : null}
      </div>
      {s.suggestionsPaused && scope === "all" ? (
        <p className="border-b border-line bg-amber-weak px-5 py-2 text-[12px] text-amber" role="status">
          Suggested replies are paused: buyer messages are still recorded, but no new AI drafts are created.
        </p>
      ) : null}
      <ol className="space-y-3 p-5" aria-label="Messages">
        {messages.map((m) => (
          <li key={m.id} className={cx("max-w-[92%] rounded-2xl border px-4 py-3", m.author === "buyer" ? "border-line bg-surface" : "ml-auto border-[#d6defe] bg-blue-weak")} data-testid={`message-${m.id}`}>
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
              <span className="font-semibold text-ink-2">{m.author === "buyer" ? "Buyer · Kestrel Lane Clinics" : "Merchant · Pinecone Media Works"}</span>
              {m.author === "buyer" ? <Badge tone="amber">Received from buyer</Badge> : <Badge tone="neutral">Sent by merchant</Badge>}
              <Pill>Pasted from WhatsApp{m.author === "buyer" ? " · untrusted data" : ""}</Pill>
              <Pill>{fmtTime(m.timestamp)}</Pill>
            </div>
            <p className="mt-1.5 text-[14px] leading-6 text-ink [overflow-wrap:anywhere]">{highlighted(m.text, evidence.filter((e) => e.messageId === m.id))}</p>
          </li>
        ))}
        {items.map((i) => (
          <ConversationBubble key={i.id} i={i} s={s} target={i.inReplyTo ? byId.get(i.inReplyTo) ?? null : null} activeVersion={active?.version ?? null} />
        ))}
        {!messages.length && !items.length ? <li className="text-[13px] text-muted">No messages yet.</li> : null}
      </ol>
      <div className="border-t border-line px-5 pb-5">
        {canAdopt ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#c9eedd] bg-green-weak px-4 py-3">
            <span className="text-[13px] text-ink-2">The buyer answered both questions. Record those replies as the confirmed answers and re-run the engine.</span>
            {typedAnswerMissing ? (
              <Link href="/clarification" className="text-[13px] font-semibold text-blue hover:underline">
                A typed reply is not interpreted: record it on Clarification →
              </Link>
            ) : (
              <ActionButton body={{ action: "adopt_replies" }} variant="primary" testId="adopt-replies">
                Use replies as confirmed answers
              </ActionButton>
            )}
          </div>
        ) : null}
        <TypedReply targets={replyTargets.map((t) => ({ id: t.id, label: `${KIND_LABEL[t.kind]} · ${fmtTime(t.sentAt!)}` }))} />
      </div>
    </Card>
  );
}

function ConversationBubble({ i, s, target, activeVersion }: { i: ConversationItem; s: DemoState; target: ConversationItem | null; activeVersion: number | null }) {
  const outbound = i.direction === "outbound";
  const replies = s.conversation.filter((r) => r.inReplyTo === i.id);
  const scripts = outbound && i.sentAt ? heroScriptedReplies.filter((r) => r.context === i.kind && (!("questionId" in r) || r.questionId === i.refs.questionId)) : [];
  // A notice stays answerable while its collection attempt is still scheduled.
  const showScripts = i.kind === "notice" ? s.attempts.find((a) => a.id === i.refs.attemptId)?.status === "scheduled" : replies.length === 0;
  const cr = s.changeRequests.find((c) => c.replyId === i.id);
  const c = i.classification;
  return (
    <li className={cx("max-w-[92%] rounded-2xl border px-4 py-3", outbound ? cx("ml-auto", i.sentAt ? "border-[#d6defe] bg-blue-weak" : "border-dashed border-[#9fb3ff] bg-surface") : "border-line bg-surface")} data-testid={`conv-${i.id}`} data-kind={i.kind}>
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <span className="font-semibold text-ink-2">{outbound ? KIND_LABEL[i.kind] : AUTHOR.buyer}</span>
        <Badge tone={STATE_TONE[i.state]}>{STATE_LABEL[i.state]}</Badge>
        {outbound ? <Pill>{AUTHOR[i.author]}</Pill> : <Pill>{i.scripted ? "Scripted simulated reply" : "Typed simulated reply"}</Pill>}
        {i.source === "buyer_proposal_page" ? <Pill>From the buyer proposal page</Pill> : null}
        <Pill>{fmtTime(i.sentAt ?? i.createdAt)}</Pill>
        {target ? <Pill>Reply to {KIND_LABEL[target.kind].toLowerCase()}{target.refs.agreementVersion ? ` v${target.refs.agreementVersion}` : ""}</Pill> : null}
      </div>
      <p className="mt-1.5 text-[14px] leading-6 text-ink [overflow-wrap:anywhere]">{outbound ? linkify(i.text) : i.text}</p>

      {!outbound && target?.kind === "notice" && c ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]" data-testid={`classification-${i.id}`}>
          {cr ? (
            <ChangeRequestBadge label={changeRequestDisplay(cr, activeVersion).label} />
          ) : (
            <Badge tone={c.kind === "needs_attention" ? "amber" : c.kind === "change_requested" ? "blue" : "neutral"}>{CLASSIFICATION_LABEL[c.kind]}</Badge>
          )}
          {!cr && c.kind === "change_requested" ? <Badge tone="amber">Merchant attention: a change request is already open</Badge> : null}
          <span className="text-muted">
            Read by code (reply-rules.v1), not AI
            {c.kind === "change_requested" ? ` · “${c.phrase}” → unavailable through ${c.unavailableUntil}, earliest debit ${c.earliestDebit}` : c.kind === "needs_attention" ? ` · ${c.detail}` : c.kind === "payment_claimed" ? " · payment status and ledger change only from a verified payment event" : " · accepts nothing and authorises nothing"}
          </span>
        </div>
      ) : null}
      {!outbound && target?.kind === "clarification" ? (
        <div className="mt-2 text-[12px] text-muted">{i.refs.answerValue ? `Scripted answer value: ${i.refs.answerValue} (script metadata, not interpreted)` : "Typed reply: not interpreted; record the answer on Clarification"}</div>
      ) : null}
      {!outbound && (target?.kind === "proposal" || target?.kind === "amendment") && i.kind === "buyer_reply" ? (
        <div className="mt-2 text-[12px] text-muted">A chat reply never accepts a proposal. Acceptance happens only on the proposal page, against the exact terms hash.</div>
      ) : null}

      {outbound && !i.sentAt && i.kind === "clarification" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ActionButton body={{ action: "send_clarification", itemId: i.id }} variant="primary" testId={`send-${i.refs.questionId}`}>
            Send to buyer
          </ActionButton>
          <span className="text-[12px] text-muted">Not sent. The merchant must send each draft.</span>
        </div>
      ) : null}
      {scripts.length && showScripts ? (
        <div className="mt-3 rounded-xl bg-violet-weak/60 px-3 py-2" data-testid={`scripts-${i.id}`}>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-violet">Simulated buyer reply · chosen by the demo operator</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {scripts.map((r) => (
              <ActionButton key={r.id} body={{ action: "buyer_reply", inReplyTo: i.id, scriptId: r.id }} variant="sim" testId={`script-${r.id}`}>
                “{r.text}”
              </ActionButton>
            ))}
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function ChangeRequestBadge({ label }: { label: string }) {
  const tone: Tone = label === "Payment rescheduled" ? "green" : label === "Not restructured" ? "red" : label.startsWith("Superseded") ? "neutral" : "blue";
  return <Badge tone={tone}>{label}</Badge>;
}
