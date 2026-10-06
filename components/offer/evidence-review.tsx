import { ReviewWorkForm } from "@/components/client";
import { fmtTime } from "@/components/evidence";
import { Card } from "@/components/ui";
import { unreviewedDecisionEvidence } from "@/lib/decision-evidence";
import type { DemoState } from "@/lib/service";

/** Merchant review boundary for buyer statements received after an offer was selected. */
export function EvidenceReview({ s }: { s: DemoState }) {
  const messages = unreviewedDecisionEvidence(s);
  if (!messages.length) return null;
  const byId = new Map(s.conversation.map((m) => [m.id, m]));
  return (
    <Card className="space-y-4 border-[#f7dfb4] p-5" data-testid="evidence-review">
      <div>
        <h2 className="text-[17px] font-semibold text-ink">New buyer evidence needs your review</h2>
        <p className="mt-1 text-[13px] text-ink-2">Adaptive Deals has stopped the offer. It will not reinterpret the buyer&apos;s words or change the terms automatically.</p>
      </div>
      {messages.map((message) => {
        const question = message.inReplyTo ? byId.get(message.inReplyTo) : null;
        const previous = question
          ? s.conversation.find((m) => m.direction === "inbound" && m.inReplyTo === question.id && m.id !== message.id && s.selectedOption?.evidenceMessageIds.includes(m.id))
          : null;
        return (
          <div key={message.id} className="rounded-xl border border-line bg-surface-muted p-4" data-testid={`evidence-${message.id}`}>
            {previous ? <p className="text-[13px] text-muted">Value used for the selected offer: “{previous.text}”</p> : null}
            <p className="mt-1 text-[14px] font-medium text-ink">New buyer message: “{message.text}”</p>
            <p className="mt-1 text-[13px] text-muted">Buyer reply · simulated WhatsApp · {fmtTime(message.createdAt)}</p>
            <ReviewWorkForm sourceKind="message" sourceId={message.id} />
          </div>
        );
      })}
    </Card>
  );
}
