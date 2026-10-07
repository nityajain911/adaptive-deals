"use client";

import type { EconomicsGuardrails } from "@/domain/business-economics";
import { rupeesInput, toNonNegativePaise, toPaise } from "@/lib/money-input";

const input = "mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[14px] text-ink";
const bps = (text: string) => /^\d+(\.\d{1,2})?$/.test(text.trim()) ? Math.round(Number(text) * 100) : null;

export function GuardrailsForm({ guardrails, ladderText, onGuardrails, onLadder }: { guardrails: EconomicsGuardrails; ladderText: string; onGuardrails: (value: EconomicsGuardrails) => void; onLadder: (value: string) => void }) {
  const set = (patch: Partial<EconomicsGuardrails>) => onGuardrails({ ...guardrails, ...patch });
  const floor = (patch: Partial<EconomicsGuardrails["contributionFloor"]>) => set({ contributionFloor: { ...guardrails.contributionFloor, ...patch } });
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5" data-testid="economics-guardrails">
      <h2 className="text-[18px] font-semibold text-ink">Commercial guardrails</h2>
      <p className="mt-1 text-[13px] leading-5 text-ink-2">Adaptive Deals can recommend only offers that pass these rules. You still approve every offer.</p>
      <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-[12px] font-semibold text-muted">Minimum contribution (%)
          <input data-testid="floor-percent" className={input} inputMode="decimal" value={(guardrails.contributionFloor.minPercentBps ?? 0) / 100} onChange={(e) => { const value = bps(e.target.value); if (value !== null) floor({ minPercentBps: value }); }} />
        </label>
        <label className="text-[12px] font-semibold text-muted">Minimum contribution amount (₹)
          <input data-testid="floor-amount" className={input} inputMode="decimal" value={rupeesInput(guardrails.contributionFloor.minPaise)} onChange={(e) => { if (!e.target.value.trim()) return floor({ minPaise: null }); const value = toNonNegativePaise(e.target.value); if (value !== null) floor({ minPaise: value }); }} />
        </label>
        <label className="text-[12px] font-semibold text-muted">Maximum discount (%)
          <input data-testid="discount-limit" className={input} inputMode="decimal" value={guardrails.discountLimitBps / 100} onChange={(e) => { const value = bps(e.target.value); if (value !== null) set({ discountLimitBps: value }); }} />
        </label>
        <label className="text-[12px] font-semibold text-muted">Approved discount ladder (%)
          <input data-testid="discount-ladder" className={input} value={ladderText} onChange={(e) => onLadder(e.target.value)} />
          <span className="mt-1 block text-[12px] font-normal text-muted">Comma-separated levels</span>
        </label>
        <label className="text-[12px] font-semibold text-muted">Maximum cash exposure (₹)
          <input data-testid="cash-exposure" className={input} inputMode="decimal" value={rupeesInput(guardrails.cashAtRiskLimitPaise)} onChange={(e) => { const value = toNonNegativePaise(e.target.value); if (value !== null) set({ cashAtRiskLimitPaise: value }); }} />
          <span className="mt-1 block text-[12px] font-normal text-muted">The most you would have paid out before being paid.</span>
        </label>
        <label className="text-[12px] font-semibold text-muted">Minimum payment (₹) · before GST
          <input data-testid="min-payment" className={input} inputMode="decimal" value={rupeesInput(guardrails.smallestInstalmentPaise)} onChange={(e) => { const value = toPaise(e.target.value); if (value !== null) set({ smallestInstalmentPaise: value }); }} />
        </label>
        <label className="text-[12px] font-semibold text-muted">Maximum payment duration (months)
          <input data-testid="max-duration" className={input} inputMode="numeric" value={guardrails.maxTenureMonths} onChange={(e) => { const value = Number(e.target.value); if (Number.isInteger(value)) set({ maxTenureMonths: value }); }} />
        </label>
        <label className="text-[12px] font-semibold text-muted">Expected processing fee · configured estimate (%)
          <input data-testid="payment-fee" className={input} inputMode="decimal" value={guardrails.paymentFeeBps / 100} onChange={(e) => { const value = bps(e.target.value); if (value !== null) set({ paymentFeeBps: value }); }} />
        </label>
        <div className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-[13px] text-ink-2">GST 18% · from your tax configuration</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Approved discount levels">
        {ladderText.split(",").map((x) => x.trim()).filter(Boolean).map((x, index) => <span key={`${x}-${index}`} className="rounded-full border border-line bg-surface-muted px-2 py-1 text-[12px] text-ink-2">{x}%</span>)}
      </div>
    </section>
  );
}
