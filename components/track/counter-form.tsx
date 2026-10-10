"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, useAction } from "../client";
import { approxINR } from "@/lib/offer-copy";
import { formatINR } from "@/domain/money";
import { toPaise } from "@/lib/money-input";
import { negotiationView } from "@/lib/negotiation-view";
import type { CorridorView } from "@/lib/service";

type Basis = "including" | "excluding";

/** Step two and three of a merchant price decision. A check is read-only until a counter is explicitly reviewed. */
export function CounterForm({ onDone, onBack }: { onDone: string; onBack: () => void }) {
  const router = useRouter();
  const check = useAction();
  const make = useAction();
  const [text, setText] = useState("");
  const [basis, setBasis] = useState<Basis | null>(null);
  const [checked, setChecked] = useState<{ paise: number; basis: Basis; view: CorridorView } | null>(null);
  const [exceptionStep, setExceptionStep] = useState(false);
  const [reason, setReason] = useState("");
  const paise = toPaise(text);
  const view = checked && checked.paise === paise && checked.basis === basis ? checked.view : null;
  const result = view?.check ?? null;
  const decision = view && result ? negotiationView({ corridor: view, buyerRequest: "", step: exceptionStep ? "exception" : "check" }) : null;
  const needsException = decision?.check?.needsException ?? false;
  const ready = !needsException || (exceptionStep && reason.trim().length >= 5);
  const reset = () => { setChecked(null); setExceptionStep(false); setReason(""); };
  const edit = (value: string) => { setText(value); reset(); };
  return <div className="space-y-3 rounded-xl border border-[#d6defe] bg-surface p-3" data-testid="counter-form">
    <div className="flex items-start justify-between gap-3"><div><h4 className="text-[14px] font-semibold text-ink">Check an amount</h4><p className="text-[13px] text-ink-2">The work and dates stay the same. Checking does not change the offer.</p></div><Button onClick={onBack}>Back</Button></div>
    <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); if (paise === null || basis === null) return; const asked = { paise, basis }; check.run({ action: "corridor_view", requestedPaise: paise, gstBasis: basis }, (response) => setChecked({ ...asked, view: response as CorridorView })); }}>
      <div className="flex flex-wrap items-end gap-2"><label className="text-[13px] font-medium text-ink">Amount (₹)<input className="mt-1 block w-44 rounded-lg border border-line-strong bg-surface px-3 py-2 text-[15px] text-ink" inputMode="decimal" value={text} onChange={(event) => edit(event.target.value)} data-testid="counter-total" /></label><Button type="submit" disabled={check.pending || paise === null || basis === null} data-testid="counter-check">{check.pending ? "Checking…" : "Check amount"}</Button></div>
      <fieldset className="text-[13px] text-ink" data-testid="corridor-basis"><legend className="font-medium">Does this include GST?</legend><div className="mt-1 flex flex-wrap gap-4"><label className="flex items-center gap-1.5"><input type="radio" name="gst-basis" checked={basis === "including"} onChange={() => { setBasis("including"); reset(); }} data-testid="corridor-basis-including" /> Including GST</label><label className="flex items-center gap-1.5"><input type="radio" name="gst-basis" checked={basis === "excluding"} onChange={() => { setBasis("excluding"); reset(); }} data-testid="corridor-basis-excluding" /> Excluding GST</label></div></fieldset>
    </form>
    <ErrorText error={check.error} />
    {view && result && decision?.check ? <div className="space-y-2 text-[14px]" data-testid="counter-result">
      <p className="text-ink" data-testid="counter-checked-total">{view.gstBasis === "excluding" ? `${formatINR(paise!)} excluding GST is ` : "Checked as "}<span className="font-semibold">{formatINR(view.requestedTotalPaise!)}</span> including GST.</p>
      <p className="text-ink" data-testid="corridor-contribution">{result.contributionPaise < 0 ? `You would lose about ${approxINR(-result.contributionPaise).replace(/^about /, "")}.` : `You would keep about ${approxINR(result.contributionPaise).replace(/^about /, "")}.`}</p>
      {result.passes && !result.negativeContribution ? <p className="font-medium text-green" data-testid="counter-passes">This is within all your rules.</p> : <p className={result.negativeContribution ? "font-medium text-red" : "font-medium text-amber"} data-testid={result.negativeContribution ? "counter-loss" : "counter-fails"}>{result.negativeContribution ? "This is less than it costs you to deliver." : `Outside your rules: ${decision.check.firstFailedRule}`}</p>}
      <details data-testid="corridor-rules"><summary className="cursor-pointer text-[13px] font-semibold text-ink">See all checks</summary><ul className="mt-1 space-y-0.5 text-[13px] text-ink-2">{result.rules.map((rule) => <li key={rule.id}>{rule.passed ? "✓" : "✕"} {rule.text}</li>)}</ul></details>
      {needsException && !exceptionStep ? <Button variant="primary" data-testid="review-exception" onClick={() => setExceptionStep(true)}>Review exception</Button> : null}
      {needsException && exceptionStep ? <div className="rounded-lg border border-[#f7dfb4] bg-amber-weak px-3 py-2" data-testid="counter-exception"><p className="font-semibold text-amber">The engine result remains outside your rules.</p><label className="mt-2 block text-[13px] font-medium text-ink">Why are you making this exception?<input className="mt-1 block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[14px] font-normal text-ink" value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} placeholder="A short reason you can read back later" data-testid="counter-reason" /></label></div> : null}
      {(!needsException || exceptionStep) ? <Button variant="primary" disabled={make.pending || !ready} data-testid="counter-make" onClick={() => make.run({ action: "counter_offer", totalPaise: view.requestedTotalPaise!, overrideConfirmed: needsException, acknowledgedChecks: result.failing.map((rule) => rule.code), reason: reason.trim() }, () => router.push(onDone))}>{make.pending ? "Preparing…" : `Review ${formatINR(view.requestedTotalPaise!)} counter-offer`}</Button> : null}
      <ErrorText error={make.error} />
    </div> : null}
  </div>;
}
