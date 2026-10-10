import { CheckCircle2, CircleDashed, Clock3, RotateCcw, XCircle } from "lucide-react";
import type { TimelineItem } from "@/lib/payment-timeline";
import { Card } from "@/components/ui";

const STYLE = {
  completed: { icon: CheckCircle2, colour: "text-green", line: "bg-green/30" },
  current: { icon: Clock3, colour: "text-blue", line: "bg-blue/30" },
  future: { icon: CircleDashed, colour: "text-muted", line: "bg-line" },
  replaced: { icon: RotateCcw, colour: "text-amber", line: "bg-amber/30" },
  failed: { icon: XCircle, colour: "text-red", line: "bg-red/30" },
  waiting: { icon: Clock3, colour: "text-amber", line: "bg-amber/30" },
} as const;

/** A semantic, chronological view of contract progress. Raw records remain in audit and disclosures. */
export function PaymentTimeline({ items, currentSentence, expectation }: { items: TimelineItem[]; currentSentence: string; expectation: string }) {
  if (!items.length) return null;
  return <Card className="p-5" data-testid="payment-timeline">
    <h2 className="text-[16px] font-semibold text-ink">Agreement and payments</h2>
    <p className="mt-1 text-[14px] text-ink-2" data-testid="timeline-current-state">{currentSentence}</p>
    <p className="mt-1 text-[13px] text-muted" data-testid="timeline-expectation">{expectation}</p>
    <ol className="mt-5 space-y-0" aria-label="Agreement and payment timeline">
      {items.map((item, index) => {
        const style = STYLE[item.state];
        const Icon = style.icon;
        return <li key={item.id} className="relative grid grid-cols-[1.5rem_1fr] gap-3 pb-5 last:pb-0" data-testid={`timeline-${item.state}`}>
          {index < items.length - 1 ? <span className={`absolute left-[11px] top-6 h-[calc(100%-0.25rem)] w-px ${style.line}`} aria-hidden /> : null}
          <Icon aria-hidden className={`relative z-10 mt-0.5 h-5 w-5 bg-surface ${style.colour}`} />
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-ink">{item.label}</div>
            {item.detail ? <p className="mt-0.5 text-[13px] leading-5 text-ink-2">{item.detail}</p> : null}
          </div>
        </li>;
      })}
    </ol>
  </Card>;
}
