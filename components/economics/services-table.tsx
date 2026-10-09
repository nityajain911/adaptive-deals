"use client";

import type { ServicePackage } from "@/domain/types";
import { InfoButton } from "@/components/info-button";
import { rupeesInput, toNonNegativePaise, toPaise } from "@/lib/money-input";

const input = "mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[14px] text-ink";

export function ServicesTable({ services, onChange }: { services: ServicePackage[]; onChange: (services: ServicePackage[]) => void }) {
  const edit = (index: number, patch: Partial<ServicePackage>) => onChange(services.map((service, i) => i === index ? { ...service, ...patch } : service));
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5" data-testid="economics-services">
      <h2 className="text-[18px] font-semibold text-ink">Your services</h2>
      <p className="mt-1 text-[13px] leading-5 text-ink-2">What you charge and what each one costs you to deliver. <InfoButton label="About quoted deals" testId="services-info">Deals you have already quoted keep their prices.</InfoButton></p>
      <div className="mt-4 divide-y divide-line">
        {services.map((service, index) => (
          <div key={service.id} className="py-4 first:pt-0 last:pb-0" data-testid={`service-row-${service.id}`}>
            <div className="grid min-w-0 gap-3 sm:grid-cols-[1.2fr_1fr_1fr] sm:items-end">
              <div className="text-[15px] font-semibold text-ink">{service.name}<span className="block text-[12px] font-normal text-muted">{service.kind === "monthly" ? "Charged every month" : "Charged once"}</span></div>
              <label className="text-[12px] font-semibold text-muted">You charge (₹)
                <input data-testid="price" inputMode="decimal" className={input} defaultValue={rupeesInput(service.listPricePaise)} onChange={(event) => { const value = toPaise(event.target.value); if (value !== null) edit(index, { listPricePaise: value }); }} />
              </label>
              <label className="text-[12px] font-semibold text-muted">It costs you (₹)
                <input data-testid="cost" inputMode="decimal" className={input} defaultValue={rupeesInput(service.directCostPaise)} onChange={(event) => { const value = toNonNegativePaise(event.target.value); if (value !== null) edit(index, { directCostPaise: value }); }} />
              </label>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-[12px] font-semibold text-blue" data-testid="service-more">More options</summary>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="text-[12px] font-semibold text-muted">Needs another service first
                  <input data-testid="dependsOn" className={input} value={(service.dependsOnAny ?? []).join(", ")} onChange={(event) => edit(index, { dependsOnAny: event.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="For example: search-marketing" />
                </label>
                <div className="space-y-2 text-[13px] text-ink-2">
                  <span data-testid="costTiming" className="block text-[12px] text-muted">You pay this cost at the start of each month of work.</span>
                  <label className="flex items-center gap-2"><input data-testid="removable" type="checkbox" checked={service.removable} onChange={(e) => edit(index, { removable: e.target.checked })} /> Can be left out of a smaller offer</label>
                  <label className="flex items-center gap-2"><input data-testid="deferrable" type="checkbox" checked={service.deferrable} onChange={(e) => edit(index, { deferrable: e.target.checked })} /> Can start later</label>
                  <label className="flex items-center gap-2"><input data-testid="independent" type="checkbox" checked={service.hasIndependentValue} onChange={(e) => edit(index, { hasIndependentValue: e.target.checked })} /> Useful to the buyer on its own</label>
                </div>
              </div>
            </details>
          </div>
        ))}
      </div>
    </section>
  );
}
