"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, useAction } from "../client";
import { approxINR } from "@/lib/offer-copy";
import { formatINR } from "@/domain/money";
import { toPaise } from "@/lib/money-input";
import type { CorridorView } from "@/lib/service";

const LOSS_CONFIRMATION = "SELL AT A LOSS";
type Basis = "including" | "excluding";

/**
 * Check the buyer's amount against the merchant's rules, then answer with it. The engine rechecks the
 * amount first; a failed rule can be sent anyway only after an explicit override with a reason, which
 * is recorded as the merchant's decision, and a loss also needs a typed confirmation.
 */
export function CounterForm({ onDone }: { onDone: string }) {
  const router = useRouter();
  const check = useAction();
  const make = useAction();
  const [text, setText] = useState("");
  const [basis, setBasis] = useState<Basis | null>(null);
  // The answer is kept with the amount and basis that produced it, so an older answer can never sit beside newer inputs.
  const [checked, setChecked] = useState<{ paise: number; basis: Basis; view: CorridorView } | null>(null);
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const paise = toPaise(text);
  const view = checked && checked.paise === paise && checked.basis === basis ? checked.view : null;
  const result = view?.check ?? null;
  const needsException = !!result && (!result.passes || result.negativeContribution);
  const ready = !!result && override && reason.trim().length >= 5 && (!result.negativeContribution || typed.trim() === LOSS_CONFIRMATION);
  const reset = () => {
    setOverride(false);
    setReason("");
    setTyped("");
  };
  const failedRules = result?.rules.filter((r) => !r.passed) ?? [];
  const passedRules = result?.rules.filter((r) => r.passed) ?? [];

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-[#d6defe] bg-blue-weak/40 p-3" data-testid="counter-form">
      <div>
        <h3 className="text-[14px] font-semibold text-ink">Check the buyer&apos;s amount</h3>
        <p className="text-[13px] text-ink-2">The same scope and dates are kept; the engine rechecks the new amount against every rule.</p>
      </div>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (paise === null || basis === null) return;
          reset();
          const asked = { paise, basis };
          check.run({ action: "corridor_view", requestedPaise: paise, gstBasis: basis }, (r) => setChecked({ ...asked, view: r as CorridorView }));
        }}
      >
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[13px] font-medium text-ink">
            The buyer&apos;s amount (₹)
            <input
              className="mt-1 block w-44 rounded-lg border border-line-strong bg-surface px-3 py-2 text-[15px] text-ink"
              inputMode="decimal"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                reset();
              }}
              data-testid="counter-total"
            />
          </label>
          <Button type="submit" disabled={check.pending || paise === null || basis === null} data-testid="counter-check">
            {check.pending ? "Checking…" : "Check this amount"}
          </Button>
        </div>
        <fieldset className="text-[13px] text-ink" data-testid="corridor-basis">
          <legend className="font-medium">Does the buyer&apos;s amount include GST?</legend>
          <div className="mt-1 flex flex-wrap gap-4">
            <label className="flex items-center gap-1.5">
              <input type="radio" name="gst-basis" checked={basis === "including"} onChange={() => { setBasis("including"); reset(); }} data-testid="corridor-basis-including" /> Including GST
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="gst-basis" checked={basis === "excluding"} onChange={() => { setBasis("excluding"); reset(); }} data-testid="corridor-basis-excluding" /> Excluding GST
            </label>
          </div>
        </fieldset>
      </form>
      <ErrorText error={check.error} />
      {view && result ? (
        <div className="space-y-2 text-[14px]" data-testid="counter-result">
          <p className="text-ink" data-testid="counter-checked-total">
            {view.gstBasis === "excluding" ? `${formatINR(paise!)} excluding GST is ` : "Checked as "}
            <span className="font-semibold">{formatINR(view.requestedTotalPaise!)}</span> including GST.
          </p>
          <p className="text-ink" data-testid="corridor-contribution">
            {result.contributionPaise < 0 ? `You would lose about ${approxINR(-result.contributionPaise).replace(/^about /, "")}.` : `You would keep about ${approxINR(result.contributionPaise).replace(/^about /, "")}.`}
          </p>
          {result.passes ? <p className="font-medium text-green" data-testid="counter-passes">The engine rechecked it: every rule passes.</p> : null}
          <div data-testid="corridor-rules">
            {failedRules.length ? (
              <ul className="space-y-0.5 text-red" data-testid="corridor-rules-failed">
                {failedRules.map((r) => (
                  <li key={r.id}>✕ {r.text}</li>
                ))}
              </ul>
            ) : null}
            {passedRules.length ? (
              <details className="mt-1 text-[13px] text-ink-2" data-testid="corridor-rules-passed">
                <summary className="cursor-pointer font-medium text-ink">{passedRules.length} rule{passedRules.length === 1 ? "" : "s"} passed</summary>
                <ul className="mt-1 space-y-0.5">
                  {passedRules.map((r) => (
                    <li key={r.id}>✓ {r.text}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
          {needsException ? (
            <div className="rounded-lg border border-[#f7dfb4] bg-amber-weak px-3 py-2" data-testid={result.passes ? "counter-loss-only" : "counter-fails"}>
              {!result.passes ? <p className="font-semibold text-amber">This amount does not meet your rules.</p> : null}
              {result.negativeContribution ? (
                <p className="mt-1 font-semibold text-red" data-testid="counter-loss">This amount is below your direct costs: you would lose {approxINR(-result.contributionPaise)}.</p>
              ) : null}
              <label className="mt-2 flex items-start gap-2 text-[13px] text-ink">
                <input type="checkbox" className="mt-0.5" checked={override} onChange={(e) => setOverride(e.target.checked)} data-testid="counter-override" />
                <span>{result.passes ? "I understand this amount is below my costs and I want to send it anyway." : "I understand these rules are not met and I want to send this amount anyway."} This is recorded as my decision, not the engine&apos;s.</span>
              </label>
              <label className="mt-2 block text-[13px] font-medium text-ink">
                Reason for sending this amount
                <input className="mt-1 block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[14px] font-normal text-ink" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="A short reason you can read back later" data-testid="counter-reason" />
              </label>
              {result.negativeContribution ? (
                <label className="mt-2 block text-[13px] font-medium text-ink">
                  Type {LOSS_CONFIRMATION} to continue
                  <input className="mt-1 block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[14px] font-normal text-ink" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-testid="counter-loss-confirm" />
                </label>
              ) : null}
            </div>
          ) : null}
          <Button
            variant="primary"
            disabled={make.pending || (needsException && !ready)}
            data-testid="counter-make"
            onClick={() =>
              make.run(
                { action: "counter_offer", totalPaise: view.requestedTotalPaise!, overrideConfirmed: needsException && override, acknowledgedChecks: result.failing.map((f) => f.code), reason: reason.trim(), typedConfirmation: typed },
                () => router.push(onDone),
              )
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
