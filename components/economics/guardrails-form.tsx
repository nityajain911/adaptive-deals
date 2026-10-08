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
      <h2 className="text-[18px] font-semibold text-ink">Your limits</h2>
      <p className="mt-1 text-[13px] leading-5 text-ink-2">Offers outside these limits are never suggested. You still approve every offer before it is sent.</p>
      <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="text-[12px] font-semibold text-muted">Lowest profit I&apos;ll accept (% of the price)
          <input data-testid="floor-percent" className={input} inputMode="decimal" value={(guardrails.contributionFloor.minPercentBps ?? 0) / 100} onChange={(e) => { const value = bps(e.target.value); if (value !== null) floor({ minPercentBps: value }); }} />
        </label>
        <label className="text-[12px] font-semibold text-muted">Biggest discount I&apos;ll give (%)
          <input data-testid="discount-limit" className={input} inputMode="decimal" value={guardrails.discountLimitBps / 100} onChange={(e) => { const value = bps(e.target.value); if (value !== null) set({ discountLimitBps: value }); }} />
        </label>
        <label className="text-[12px] font-semibold text-muted">Most I&apos;ll spend before I&apos;m paid (₹)
          <input data-testid="cash-exposure" className={input} inputMode="decimal" value={rupeesInput(guardrails.cashAtRiskLimitPaise)} onChange={(e) => { const value = toNonNegativePaise(e.target.value); if (value !== null) set({ cashAtRiskLimitPaise: value }); }} />
          <span className="mt-1 block text-[12px] font-normal text-muted">Delivery costs you would cover before the customer&apos;s money arrives.</span>
        </label>
        <label className="text-[12px] font-semibold text-muted">Smallest payment I&apos;ll take (₹, before GST)
          <input data-testid="min-payment" className={input} inputMode="decimal" value={rupeesInput(guardrails.smallestInstalmentPaise)} onChange={(e) => { const value = toPaise(e.target.value); if (value !== null) set({ smallestInstalmentPaise: value }); }} />
        </label>
        <label className="text-[12px] font-semibold text-muted">Longest I&apos;ll wait to be paid in full (months)
          <input data-testid="max-duration" className={input} inputMode="numeric" value={guardrails.maxTenureMonths} onChange={(e) => { const value = Number(e.target.value); if (Number.isInteger(value)) set({ maxTenureMonths: value }); }} />
        </label>
      </div>
      <details className="mt-4">
        <summary className="cursor-pointer text-[12px] font-semibold text-blue" data-testid="limits-more">More options</summary>
        <div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="text-[12px] font-semibold text-muted">…or at least this much profit (₹)
            <input data-testid="floor-amount" className={input} inputMode="decimal" value={rupeesInput(guardrails.contributionFloor.minPaise)} onChange={(e) => { if (!e.target.value.trim()) return floor({ minPaise: null }); const value = toNonNegativePaise(e.target.value); if (value !== null) floor({ minPaise: value }); }} />
          </label>
          <label className="text-[12px] font-semibold text-muted">Discount steps I&apos;m happy to offer (%)
            <input data-testid="discount-ladder" className={input} value={ladderText} onChange={(e) => onLadder(e.target.value)} />
            <span className="mt-1 block text-[12px] font-normal text-muted">Separate with commas, for example 0, 5, 10.</span>
          </label>
          <label className="text-[12px] font-semibold text-muted">Payment fee I expect to pay (%)
            <input data-testid="payment-fee" className={input} inputMode="decimal" value={guardrails.paymentFeeBps / 100} onChange={(e) => { const value = bps(e.target.value); if (value !== null) set({ paymentFeeBps: value }); }} />
          </label>
          <div className="self-end rounded-lg border border-line bg-surface-muted px-3 py-2 text-[13px] text-ink-2">GST (18%) is added to your prices.</div>
        </div>
      </details>
    </section>
  );
}
