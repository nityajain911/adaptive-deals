"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, useAction } from "../client";
import { approxINR } from "@/lib/offer-copy";
import { formatINR } from "@/domain/money";

interface Check {
  currentTotalPaise: number;
  totalPaise: number;
  passes: boolean;
  failing: { id: string; code: string; text: string }[];
  contributionPaise: number;
  discountBps: number;
}

/** "₹10,000" or "10000.50" → paise, or null when it is not a usable amount. */
function toPaise(text: string): number | null {
  const cleaned = text.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const paise = Math.round(Number(cleaned) * 100);
  return paise > 0 ? paise : null;
}

/**
 * The merchant's answer to a buyer's request for a lower total. The engine rechecks the amount first;
 * a failed rule can be sent anyway only after an explicit override, which is recorded as the merchant's.
 */
export function CounterForm({ currentTotalPaise, onDone }: { currentTotalPaise: number; onDone: string }) {
  const router = useRouter();
  const check = useAction();
  const make = useAction();
  const [text, setText] = useState("");
  const [result, setResult] = useState<Check | null>(null);
  const [override, setOverride] = useState(false);
  const paise = toPaise(text);

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-[#d6defe] bg-blue-weak/40 p-3" data-testid="counter-form">
      <div>
        <h3 className="text-[14px] font-semibold text-ink">Answer with a different total</h3>
        <p className="text-[13px] text-ink-2">Current offer: {formatINR(currentTotalPaise)} including GST. The same scope and dates are kept; the engine rechecks the new amount.</p>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (paise === null) return;
          setOverride(false);
          check.run({ action: "check_counter_offer", totalPaise: paise }, (r) => setResult(r as Check));
        }}
      >
        <label className="text-[13px] font-medium text-ink">
          New total including GST (₹)
          <input
            className="mt-1 block w-44 rounded-lg border border-line-strong bg-surface px-3 py-2 text-[15px] text-ink"
            inputMode="decimal"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setResult(null);
              setOverride(false);
            }}
            data-testid="counter-total"
          />
        </label>
        <Button type="submit" disabled={check.pending || paise === null} data-testid="counter-check">
          {check.pending ? "Checking…" : "Check this amount"}
        </Button>
      </form>
      <ErrorText error={check.error} />
      {result ? (
        <div className="space-y-2 text-[14px]" data-testid="counter-result">
          <p className="text-ink">
            New total <span className="font-semibold">{formatINR(result.totalPaise)}</span> including GST · projected contribution {approxINR(result.contributionPaise)}
          </p>
          {result.passes ? (
            <p className="font-medium text-green" data-testid="counter-passes">The engine rechecked it: every rule passes.</p>
          ) : (
            <div className="rounded-lg border border-[#f7dfb4] bg-amber-weak px-3 py-2" data-testid="counter-fails">
              <p className="font-semibold text-amber">This amount does not meet your rules:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-2">
                {result.failing.map((f) => (
                  <li key={f.id}>{f.text}</li>
                ))}
              </ul>
              <label className="mt-2 flex items-start gap-2 text-[13px] text-ink">
                <input type="checkbox" className="mt-0.5" checked={override} onChange={(e) => setOverride(e.target.checked)} data-testid="counter-override" />
                <span>I understand these rules are not met and I want to send this amount anyway. This is recorded as my decision, not the engine&apos;s.</span>
              </label>
            </div>
          )}
          <Button
            variant="primary"
            disabled={make.pending || (!result.passes && !override)}
            data-testid="counter-make"
            onClick={() =>
              make.run({ action: "counter_offer", totalPaise: paise!, overrideConfirmed: !result.passes && override }, () => router.push(onDone))
            }
          >
            {make.pending ? "Preparing…" : "Prepare counter-offer"}
          </Button>
          <ErrorText error={make.error} />
        </div>
      ) : null}
    </div>
  );
}
