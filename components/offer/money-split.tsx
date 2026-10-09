import { formatINR } from "@/domain/money";
import { approxINR } from "@/lib/offer-copy";

interface Part {
  id: "keep" | "costs" | "fees" | "gst";
  label: string;
  paise: number;
  bar: string;
  dot: string;
}

/**
 * Where the buyer's money goes, as one bar that fills in when the offer appears (like the earnings
 * flow on the Razorpay home). Pure display: every figure is passed in from the engine's result.
 */
export function MoneySplit({ gstPaise, costsPaise, feesPaise, keepPaise }: { gstPaise: number; costsPaise: number; feesPaise: number; keepPaise: number }) {
  const parts: Part[] = [
    { id: "keep", label: "You keep", paise: Math.max(0, keepPaise), bar: "bg-green", dot: "bg-green" },
    { id: "costs", label: "Delivery costs", paise: costsPaise, bar: "bg-blue", dot: "bg-blue" },
    { id: "fees", label: "Payment fees", paise: feesPaise, bar: "bg-amber", dot: "bg-amber" },
    { id: "gst", label: "GST", paise: gstPaise, bar: "bg-line-strong", dot: "bg-line-strong" },
  ];
  const total = parts.reduce((n, p) => n + p.paise, 0);
  if (total <= 0) return null;
  return (
    <figure className="mt-3" data-testid="money-split" aria-label="Where the buyer's money goes">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={parts.map((p) => `${p.label} ${approxINR(p.paise)}`).join(", ")}>
        {parts.map((p, i) => (
          <span key={p.id} className={`money-split-segment ${p.bar}`} style={{ width: `${(p.paise / total) * 100}%`, animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
      <figcaption className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-ink-2">
        {parts.map((p) => (
          <span key={p.id} className="flex items-center gap-1.5">
            <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${p.dot}`} />
            <span className="truncate">{p.label}</span>
            <span className="tabular ml-auto font-medium text-ink">{formatINR(Math.round(p.paise / 100) * 100)}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
