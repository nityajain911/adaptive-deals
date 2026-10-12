"use client";

import type { EconomicsGuardrails } from "@/domain/business-economics";
import { InfoButton } from "@/components/info-button";
import { rupeesInput, toNonNegativePaise, toPaise } from "@/lib/money-input";

const box = "w-full rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-right text-[14px] text-ink";
const bps = (text: string) => /^\d+(\.\d{1,2})?$/.test(text.trim()) ? Math.round(Number(text) * 100) : null;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A percentage the merchant can drag or type. The slider keeps to a sensible range; the number box accepts any valid value. */
function PercentSlider({ label, valueBps, min, max, onChange, boxTestId, sliderTestId }: { label: string; valueBps: number; min: number; max: number; onChange: (bps: number) => void; boxTestId: string; sliderTestId: string }) {
  const percent = valueBps / 100;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_84px]">
      <label className="text-[14px] text-ink" htmlFor={boxTestId}>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={clamp(Math.round(percent), min, max)}
        onChange={(event) => onChange(Number(event.target.value) * 100)}
        aria-label={`${label}, slider from ${min}% to ${max}%`}
        data-testid={sliderTestId}
        className="order-3 col-span-2 w-full accent-[var(--blue)] sm:order-none sm:col-span-1"
      />
      <span className="relative">
        <input id={boxTestId} data-testid={boxTestId} className={`${box} pr-6`} inputMode="decimal" value={percent} onChange={(event) => { const next = bps(event.target.value); if (next !== null) onChange(next); }} />
        <span aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[13px] text-muted">%</span>
      </span>
    </div>
  );
}

function Field({ label, children, hint }: { label: React.ReactNode; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,140px)] items-center gap-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_84px]">
      <span className="text-[14px] text-ink">{label}{hint}</span>
      <span className="hidden sm:block" />
      {children}
    </div>
  );
}

export function GuardrailsForm({ guardrails, ladderText, onGuardrails, onLadder }: { guardrails: EconomicsGuardrails; ladderText: string; onGuardrails: (value: EconomicsGuardrails) => void; onLadder: (value: string) => void }) {
  const set = (patch: Partial<EconomicsGuardrails>) => onGuardrails({ ...guardrails, ...patch });
  const floor = (patch: Partial<EconomicsGuardrails["contributionFloor"]>) => set({ contributionFloor: { ...guardrails.contributionFloor, ...patch } });
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5" data-testid="economics-guardrails">
      <h2 className="text-[18px] font-semibold text-ink">Your limits</h2>

      <div className="mt-3 space-y-3" role="group" aria-labelledby="margin-guardrails" data-testid="margin-guardrails">
        <h3 id="margin-guardrails" className="text-[12px] font-semibold uppercase tracking-wide text-muted">Margin guardrails</h3>
        <PercentSlider label="Lowest profit I'll accept" valueBps={guardrails.contributionFloor.minPercentBps ?? 0} min={10} max={50} onChange={(value) => floor({ minPercentBps: value })} boxTestId="floor-percent" sliderTestId="floor-slider" />
        <PercentSlider label="Biggest discount I'll give" valueBps={guardrails.discountLimitBps} min={0} max={25} onChange={(value) => set({ discountLimitBps: value })} boxTestId="discount-limit" sliderTestId="discount-slider" />
        <Field label={<>Smallest payment I&apos;ll take <span className="text-[12px] text-muted">before GST</span></>}>
          <span className="relative"><span aria-hidden className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[13px] text-muted">₹</span><input data-testid="min-payment" aria-label="Smallest payment I'll take, before GST, in rupees" className={`${box} pl-6`} inputMode="decimal" value={rupeesInput(guardrails.smallestInstalmentPaise)} onChange={(e) => { const value = toPaise(e.target.value); if (value !== null) set({ smallestInstalmentPaise: value }); }} /></span>
        </Field>
      </div>

      <div className="mt-5 space-y-3" role="group" aria-labelledby="cashflow-guardrails" data-testid="cashflow-guardrails">
        <h3 id="cashflow-guardrails" className="text-[12px] font-semibold uppercase tracking-wide text-muted">Cashflow guardrails</h3>
        <Field label={<>Most I&apos;ll spend before I&apos;m paid <InfoButton label="What this means" testId="cash-exposure-info">Delivery costs you would cover before the customer&apos;s money arrives.</InfoButton></>}>
          <span className="relative"><span aria-hidden className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[13px] text-muted">₹</span><input data-testid="cash-exposure" aria-label="Most I'll spend before I'm paid, in rupees" className={`${box} pl-6`} inputMode="decimal" value={rupeesInput(guardrails.cashAtRiskLimitPaise)} onChange={(e) => { const value = toNonNegativePaise(e.target.value); if (value !== null) set({ cashAtRiskLimitPaise: value }); }} /></span>
        </Field>
        <Field label="Longest I'll wait to be paid in full">
          <span className="relative"><input data-testid="max-duration" aria-label="Longest I'll wait to be paid in full, in months" className={`${box} pr-9`} inputMode="numeric" value={guardrails.maxTenureMonths} onChange={(e) => { const value = Number(e.target.value); if (Number.isInteger(value)) set({ maxTenureMonths: value }); }} /><span aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[13px] text-muted">mo</span></span>
        </Field>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-[12px] font-semibold text-blue" data-testid="limits-more">More options</summary>
        <div className="mt-3 space-y-3">
          <Field label="…or at least this much profit"><span className="relative"><span aria-hidden className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[13px] text-muted">₹</span><input data-testid="floor-amount" aria-label="At least this much profit, in rupees" className={`${box} pl-6`} inputMode="decimal" value={rupeesInput(guardrails.contributionFloor.minPaise)} onChange={(e) => { if (!e.target.value.trim()) return floor({ minPaise: null }); const value = toNonNegativePaise(e.target.value); if (value !== null) floor({ minPaise: value }); }} /></span></Field>
          <Field label="Payment fee I expect to pay"><span className="relative"><input data-testid="payment-fee" aria-label="Payment fee I expect to pay, percent" className={`${box} pr-6`} inputMode="decimal" value={guardrails.paymentFeeBps / 100} onChange={(e) => { const value = bps(e.target.value); if (value !== null) set({ paymentFeeBps: value }); }} /><span aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[13px] text-muted">%</span></span></Field>
          <label className="block text-[13px] font-medium text-ink">Discount steps I&apos;m happy to offer (%, separated by commas)
            <input data-testid="discount-ladder" className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[14px] font-normal text-ink" value={ladderText} onChange={(e) => onLadder(e.target.value)} placeholder="0, 5, 10" />
          </label>
          <p className="text-[12px] text-muted">GST (18%) is added to your prices.</p>
        </div>
      </details>
    </section>
  );
}
