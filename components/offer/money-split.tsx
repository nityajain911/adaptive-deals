import { formatINR } from "@/domain/money";
import { approxINR } from "@/lib/offer-copy";

interface Part {
  id: "keep" | "costs" | "fees" | "gst" | "loss";
  label: string;
  paise: number;
  /** Width in the bar, which can be smaller than the amount when part of a cost is drawn as the loss. */
  barPaise: number;
  bar: string;
  dot: string;
}

const rupees = (paise: number) => formatINR(Math.round(paise / 100) * 100);

/**
 * Where the buyer's money goes, as one bar that fills in when the offer appears (like the earnings
 * flow on the Razorpay home). Pure display: every figure is passed in from the engine's result.
 *
 * When the price does not cover the costs, the buyer's money (GST plus the price) is all spent and the
 * costs and fees still exceed it. That excess is the loss: the bar then covers everything the business
 * has to pay out, and the last part of it, equal to the loss, is drawn in red and labelled as a loss.
 */
export function MoneySplit({ gstPaise, costsPaise, feesPaise, keepPaise }: { gstPaise: number; costsPaise: number; feesPaise: number; keepPaise: number }) {
  const loss = Math.max(0, -keepPaise);
  // The loss is taken from the fees first and then the costs, so the red part sits at the end of the bar.
  const lossFromFees = Math.min(loss, feesPaise);
  const lossFromCosts = loss - lossFromFees;
  const parts: Part[] = [
    ...(loss > 0
      ? []
      : [{ id: "keep", label: "You keep", paise: Math.max(0, keepPaise), barPaise: Math.max(0, keepPaise), bar: "bg-green", dot: "bg-green" } as Part]),
    { id: "costs", label: "Delivery costs", paise: costsPaise, barPaise: costsPaise - lossFromCosts, bar: "bg-blue", dot: "bg-blue" },
    { id: "fees", label: "Payment fees", paise: feesPaise, barPaise: feesPaise - lossFromFees, bar: "bg-amber", dot: "bg-amber" },
    { id: "gst", label: "GST", paise: gstPaise, barPaise: gstPaise, bar: "bg-line-strong", dot: "bg-line-strong" },
    ...(loss > 0 ? [{ id: "loss", label: "You lose", paise: loss, barPaise: loss, bar: "bg-red", dot: "bg-red" } as Part] : []),
  ];
  const total = parts.reduce((n, p) => n + p.barPaise, 0);
  if (total <= 0) return null;
  const order: Part["id"][] = loss > 0 ? ["gst", "costs", "fees", "loss"] : ["keep", "costs", "fees", "gst"];
  const bar = order.map((id) => parts.find((p) => p.id === id)!);
  return (
    <figure className="mt-3" data-testid="money-split" data-loss={loss > 0 ? "true" : undefined} aria-label="Where the buyer's money goes">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={bar.map((p) => `${p.label} ${approxINR(p.paise)}`).join(", ")}>
        {bar.map((p, i) => (
          <span key={p.id} className={`money-split-segment ${p.bar}`} style={{ width: `${(p.barPaise / total) * 100}%`, animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
      <figcaption className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-ink-2">
        {bar.map((p) => (
          <span key={p.id} className={`flex items-center gap-1.5 ${p.id === "loss" ? "font-semibold text-red" : ""}`}>
            <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${p.dot}`} />
            <span className="truncate">{p.label}</span>
            <span className={`tabular ml-auto font-medium ${p.id === "loss" ? "text-red" : "text-ink"}`}>{rupees(p.paise)}</span>
          </span>
        ))}
      </figcaption>
      {loss > 0 ? <p className="mt-1.5 text-[12px] text-red">The price is {rupees(loss)} short of your delivery costs and fees.</p> : null}
    </figure>
  );
}
