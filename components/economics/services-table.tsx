"use client";

import type { ServicePackage } from "@/domain/types";
import { rupeesInput, toNonNegativePaise, toPaise } from "@/lib/money-input";

const input = "mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[14px] text-ink";

export function ServicesTable({ services, onChange }: { services: ServicePackage[]; onChange: (services: ServicePackage[]) => void }) {
  const edit = (index: number, patch: Partial<ServicePackage>) => onChange(services.map((service, i) => i === index ? { ...service, ...patch } : service));
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5" data-testid="economics-services">
      <h2 className="text-[18px] font-semibold text-ink">Services and delivery costs</h2>
      <p className="mt-1 text-[13px] leading-5 text-ink-2">These figures let Adaptive Deals protect what you keep after direct delivery costs.</p>
      <div className="mt-4 space-y-4">
        {services.map((service, index) => (
          <fieldset key={service.id} className="min-w-0 rounded-xl border border-line p-3 sm:p-4" data-testid={`service-row-${service.id}`}>
            <legend className="px-1 text-[14px] font-semibold text-ink">{service.name}</legend>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex min-w-0 flex-col justify-between text-[12px] font-semibold text-muted">Standard price · applies to new quotes
                <input data-testid="price" inputMode="decimal" className={input} defaultValue={rupeesInput(service.listPricePaise)} onChange={(event) => { const value = toPaise(event.target.value); if (value !== null) edit(index, { listPricePaise: value }); }} />
              </label>
              <label className="flex min-w-0 flex-col justify-between text-[12px] font-semibold text-muted">Direct delivery cost (₹)
                <input data-testid="cost" inputMode="decimal" className={input} defaultValue={rupeesInput(service.directCostPaise)} onChange={(event) => { const value = toNonNegativePaise(event.target.value); if (value !== null) edit(index, { directCostPaise: value }); }} />
              </label>
              <label className="flex min-w-0 flex-col justify-between text-[12px] font-semibold text-muted">Cost timing
                <span data-testid="costTiming" className="mt-1 block rounded-lg border border-line bg-surface-muted px-3 py-2 text-[14px] font-normal leading-5 text-ink-2">Start of each delivery month</span>
              </label>
              <label className="flex min-w-0 flex-col justify-between text-[12px] font-semibold text-muted">Depends on
                <input data-testid="dependsOn" className={input} value={(service.dependsOnAny ?? []).join(", ")} onChange={(event) => edit(index, { dependsOnAny: event.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="Service IDs, comma-separated" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-ink-2">
              <label className="flex items-center gap-2"><input data-testid="removable" type="checkbox" checked={service.removable} onChange={(e) => edit(index, { removable: e.target.checked })} /> Can be removed</label>
              <label className="flex items-center gap-2"><input data-testid="deferrable" type="checkbox" checked={service.deferrable} onChange={(e) => edit(index, { deferrable: e.target.checked })} /> Can start later</label>
              <label className="flex items-center gap-2"><input data-testid="independent" type="checkbox" checked={service.hasIndependentValue} onChange={(e) => edit(index, { hasIndependentValue: e.target.checked })} /> Valuable on its own</label>
            </div>
          </fieldset>
        ))}
      </div>
      <p className="mt-3 text-[13px] text-muted">Existing deals keep the prices they were quoted at.</p>
    </section>
  );
}
