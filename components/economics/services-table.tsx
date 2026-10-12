"use client";

import type { EconomicsGuardrails } from "@/domain/business-economics";
import type { ServicePackage } from "@/domain/types";
import { InfoButton } from "@/components/info-button";
import { formatINR } from "@/domain/money";
import { rupeesInput, toNonNegativePaise, toPaise } from "@/lib/money-input";
import { serviceStatus } from "@/lib/service-status";
import { cx } from "@/components/ui";

const cell = "w-full rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-[14px] text-ink sm:text-right";
const TONE = { green: "text-green", amber: "text-amber", red: "text-red" } as const;
const DOT = { green: "bg-green", amber: "bg-amber", red: "bg-red" } as const;
const COLUMNS = "sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]";

/** One compact row per service: what you charge, what it costs, what you keep, and whether it is ready. */
export function ServicesTable({ services, guardrails, onChange }: { services: ServicePackage[]; guardrails: Pick<EconomicsGuardrails, "contributionFloor">; onChange: (services: ServicePackage[]) => void }) {
  const edit = (index: number, patch: Partial<ServicePackage>) => onChange(services.map((service, i) => i === index ? { ...service, ...patch } : service));
  const advancedSet = services.filter((service) => (service.dependsOnAny?.length ?? 0) > 0 || service.removable || service.deferrable || !service.hasIndependentValue).length;
  const dependencies = services.filter((service) => (service.dependsOnAny?.length ?? 0) > 0).length;
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5" data-testid="economics-services">
      <h2 className="text-[18px] font-semibold text-ink">Your services</h2>
      <p className="mt-1 text-[13px] leading-5 text-ink-2">What you charge and what each one costs you to deliver. <InfoButton label="About quoted deals" testId="services-info">Deals you have already quoted keep their prices. “You keep” is before payment fees.</InfoButton></p>
      <div className="mt-4" role="table" aria-label="Your services">
        <div role="row" className={cx("hidden gap-3 border-b border-line pb-2 text-[12px] font-semibold uppercase tracking-wide text-muted sm:grid", COLUMNS)}>
          <span role="columnheader">Service</span><span role="columnheader" className="text-right">You charge (₹)</span><span role="columnheader" className="text-right">It costs you (₹)</span><span role="columnheader" className="text-right">You keep</span><span role="columnheader">Status</span>
        </div>
        <div className="divide-y divide-line">
          {services.map((service, index) => {
            const status = serviceStatus(service, guardrails);
            return (
              <div key={service.id} role="row" className={cx("grid min-w-0 grid-cols-2 items-center gap-x-3 gap-y-2 py-3 sm:gap-y-0", COLUMNS)} data-testid={`service-row-${service.id}`}>
                <div role="cell" className="col-span-2 min-w-0 text-[15px] font-semibold text-ink sm:col-span-1">{service.name}<span className="block text-[12px] font-normal text-muted">{service.kind === "monthly" ? "Charged every month" : "Charged once"}</span></div>
                <label role="cell" className="text-[12px] font-semibold text-muted sm:text-[0px]"><span className="sm:sr-only">You charge (₹)</span>
                  <input data-testid="price" inputMode="decimal" aria-label={`${service.name}: you charge`} className={cx(cell, "mt-1 sm:mt-0")} defaultValue={rupeesInput(service.listPricePaise)} onChange={(event) => { const value = toPaise(event.target.value); if (value !== null) edit(index, { listPricePaise: value }); }} />
                </label>
                <label role="cell" className="text-[12px] font-semibold text-muted sm:text-[0px]"><span className="sm:sr-only">It costs you (₹)</span>
                  <input data-testid="cost" inputMode="decimal" aria-label={`${service.name}: it costs you`} className={cx(cell, "mt-1 sm:mt-0")} defaultValue={rupeesInput(service.directCostPaise)} onChange={(event) => { const value = toNonNegativePaise(event.target.value); if (value !== null) edit(index, { directCostPaise: value }); }} />
                </label>
                <div role="cell" className="text-[14px] text-ink sm:text-right" data-testid={`keep-${service.id}`}><span className="text-[12px] text-muted sm:hidden">You keep </span>{formatINR(status.keepPaise)} <span className="text-muted">({status.keepPercent}%)</span></div>
                <div role="cell" className={cx("flex items-center gap-1.5 text-[13px] font-medium", TONE[status.tone])} data-testid={`status-${service.id}`}><span aria-hidden className={cx("h-2 w-2 shrink-0 rounded-full", DOT[status.tone])} />{status.label}</div>
              </div>
            );
          })}
        </div>
      </div>
      <details className="mt-3 rounded-xl border border-line bg-surface-muted px-3 py-2" data-testid="advanced-rules">
        <summary className="cursor-pointer text-[13px] font-semibold text-ink" data-testid="service-more">Advanced rules <span className="font-normal text-muted">· {dependencies ? `${dependencies} service${dependencies === 1 ? "" : "s"} depend${dependencies === 1 ? "s" : ""} on another` : "no dependencies set"}{advancedSet ? "" : ""}</span></summary>
        <p className="mt-2 text-[12px] text-ink-2">These decide which smaller offers are allowed. Nothing here is guessed for you: the app only follows what you set.</p>
        <div className="mt-2 divide-y divide-line">
          {services.map((service, index) => (
            <div key={service.id} className="grid gap-3 py-3 sm:grid-cols-2" data-testid={`advanced-${service.id}`}>
              <div>
                <div className="text-[13px] font-semibold text-ink">{service.name}</div>
                <label className="mt-1 block text-[12px] font-semibold text-muted">Needs another service first
                  <input data-testid="dependsOn" className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[14px] font-normal text-ink" value={(service.dependsOnAny ?? []).join(", ")} onChange={(event) => edit(index, { dependsOnAny: event.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="For example: search-marketing" />
                </label>
              </div>
              <div className="space-y-2 text-[13px] text-ink-2">
                <span data-testid="costTiming" className="block text-[12px] text-muted">You pay this cost at the start of each month of work.</span>
                <label className="flex items-center gap-2"><input data-testid="removable" type="checkbox" checked={service.removable} onChange={(e) => edit(index, { removable: e.target.checked })} /> Can be left out of a smaller offer</label>
                <label className="flex items-center gap-2"><input data-testid="deferrable" type="checkbox" checked={service.deferrable} onChange={(e) => edit(index, { deferrable: e.target.checked })} /> Can start later</label>
                <label className="flex items-center gap-2"><input data-testid="independent" type="checkbox" checked={service.hasIndependentValue} onChange={(e) => edit(index, { hasIndependentValue: e.target.checked })} /> Useful to the buyer on its own</label>
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
