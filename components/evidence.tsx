import type { Evidence, Message } from "@/domain/types";
import { Badge, Pill, cx } from "./ui";

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) + " IST";

export { fmtTime };

/** Render message text with every verified evidence span highlighted (offsets from code). */
export function highlighted(text: string, spans: { start: number; end: number; label: string }[]) {
  const sorted = [...spans].sort((a, b) => a.start - b.start).filter((s, i, arr) => i === 0 || s.start >= arr[i - 1].end);
  const out: React.ReactNode[] = [];
  let pos = 0;
  sorted.forEach((s, i) => {
    if (s.start > pos) out.push(text.slice(pos, s.start));
    out.push(
      <mark key={i} className="evidence" title={s.label}>
        {text.slice(s.start, s.end)}
      </mark>,
    );
    pos = s.end;
  });
  out.push(text.slice(pos));
  return out;
}

export function Conversation({ messages, evidence }: { messages: Message[]; evidence: (Evidence & { label: string })[] }) {
  return (
    <ol className="space-y-3" aria-label="Buyer conversation">
      {messages.map((m) => {
        const spans = evidence.filter((e) => e.messageId === m.id);
        return (
          <li key={m.id} className={cx("max-w-[92%] rounded-2xl border px-4 py-3", m.author === "buyer" ? "border-line bg-surface" : "ml-auto border-[#d6defe] bg-blue-weak")} data-testid={`message-${m.id}`}>
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
              <span className="font-semibold text-ink-2">{m.author === "buyer" ? "Buyer · Kestrel Lane Clinics" : "Merchant · Pinecone Media Works"}</span>
              <Pill>{m.source === "whatsapp" ? "WhatsApp (pasted)" : "Email (pasted)"}</Pill>
              <Pill>{fmtTime(m.timestamp)}</Pill>
              <span className="font-mono text-[11px]">{m.id}</span>
              {m.inReplyTo ? <Badge tone="violet">Reply to {m.inReplyTo}</Badge> : null}
            </div>
            <p className="mt-1.5 text-[14px] leading-6 text-ink">{highlighted(m.text, spans)}</p>
          </li>
        );
      })}
    </ol>
  );
}

export function Quote({ e, messages }: { e: Evidence; messages: Message[] }) {
  const m = messages.find((x) => x.id === e.messageId);
  return (
    <div className="mt-1 rounded-lg bg-surface-muted px-3 py-2 text-[12px] text-ink-2">
      <span className="font-medium text-ink">“{e.quote}”</span>
      <span className="ml-1 text-muted">
        · {e.messageId}
        {m ? ` · ${fmtTime(m.timestamp)}` : ""} · chars {e.start}–{e.end}
      </span>
    </div>
  );
}
