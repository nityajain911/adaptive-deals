"use client";

import { useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import type { EconomicsGuardrails } from "@/domain/business-economics";
import type { ServicePackage } from "@/domain/types";
import { formatINR } from "@/domain/money";
import { rupeesInput, toNonNegativePaise, toPaise } from "@/lib/money-input";
import { serviceStatus } from "@/lib/service-status";
import { Button } from "@/components/client";
import { cx } from "@/components/ui";

const cell = "w-full rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-[14px] text-ink text-right";
const TONE = { green: "text-green", amber: "text-amber", red: "text-red" } as const;
const DOT = { green: "bg-green", amber: "bg-amber", red: "bg-red" } as const;

/** One row per service with only what most merchants touch: what you charge and what it costs. The rules sit one click away. */
export function ServicesTable({ services, guardrails, onChange }: { services: ServicePackage[]; guardrails: Pick<EconomicsGuardrails, "contributionFloor">; onChange: (services: ServicePackage[]) => void }) {
  const edit = (index: number, patch: Partial<ServicePackage>) => onChange(services.map((service, i) => i === index ? { ...service, ...patch } : service));
  const [editing, setEditing] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (editing && !d.open) d.showModal();
    if (!editing && d.open) d.close();
  }, [editing]);
  const index = services.findIndex((service) => service.id === editing);
  const open = index >= 0 ? services[index]! : null;

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5" data-testid="economics-services">
      <h2 className="text-[18px] font-semibold text-ink">Your services</h2>
      <div className="mt-3" role="table" aria-label="Your services">
        <div role="row" className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_40px] gap-3 border-b border-line pb-2 text-[12px] font-semibold uppercase tracking-wide text-muted sm:grid">
          <span role="columnheader">Service</span><span role="columnheader" className="text-right">You charge (₹)</span><span role="columnheader" className="text-right">Your cost (₹)</span><span role="columnheader" className="sr-only">Rules</span>
        </div>
        <div className="divide-y divide-line">
          {services.map((service, i) => {
            const status = serviceStatus(service, guardrails);
            return (
              <div key={service.id} role="row" className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] items-center gap-x-3 gap-y-2 py-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_40px]" data-testid={`service-row-${service.id}`}>
                <div role="cell" className="col-span-2 min-w-0 sm:col-span-1">
                  <span className="block text-[15px] font-semibold text-ink">{service.name}</span>
                  <span className="block text-[12px] text-muted">{service.kind === "monthly" ? "Every month" : "Once"}</span>
                  {status.tone !== "green" ? <span className={cx("mt-0.5 flex items-center gap-1.5 text-[12px] font-medium", TONE[status.tone])} data-testid={`status-${service.id}`}><span aria-hidden className={cx("h-2 w-2 rounded-full", DOT[status.tone])} />{status.label}</span> : null}
                </div>
                <label role="cell" className="text-[12px] font-semibold text-muted sm:text-[0px]"><span className="sm:sr-only">You charge (₹)</span>
                  <input data-testid="price" inputMode="decimal" aria-label={`${service.name}: you charge`} className={cx(cell, "mt-1 sm:mt-0")} defaultValue={rupeesInput(service.listPricePaise)} onChange={(event) => { const value = toPaise(event.target.value); if (value !== null) edit(i, { listPricePaise: value }); }} />
                </label>
                <label role="cell" className="text-[12px] font-semibold text-muted sm:text-[0px]"><span className="sm:sr-only">Your cost (₹)</span>
                  <input data-testid="cost" inputMode="decimal" aria-label={`${service.name}: your cost`} className={cx(cell, "mt-1 sm:mt-0")} defaultValue={rupeesInput(service.directCostPaise)} onChange={(event) => { const value = toNonNegativePaise(event.target.value); if (value !== null) edit(i, { directCostPaise: value }); }} />
                </label>
                <div role="cell" className="row-span-2 self-center sm:row-span-1">
                  <button type="button" onClick={() => setEditing(service.id)} aria-label={`Edit rules for ${service.name}`} data-testid={`edit-rules-${service.id}`} className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink-2 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"><Settings2 aria-hidden className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <dialog
        ref={dialog}
        onClose={() => setEditing(null)}
        data-testid="service-rules-panel"
        aria-labelledby="service-rules-title"
        className="m-0 ml-auto h-full max-h-none w-full max-w-[420px] border-l border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/30"
      >
        {open ? (
          <div className="flex h-full flex-col" data-testid={`advanced-${open.id}`}>
            <div className="border-b border-line px-5 py-4">
              <h2 id="service-rules-title" className="text-[18px] font-semibold text-ink">{open.name}</h2>
              <p className="mt-0.5 text-[13px] text-ink-2" data-testid={`keep-${open.id}`}>{`You keep ${formatINR(serviceStatus(open, guardrails).keepPaise)} (${serviceStatus(open, guardrails).keepPercent}%) before payment fees · ${serviceStatus(open, guardrails).label}`}</p>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <fieldset>
                <legend className="text-[13px] font-semibold text-ink">Needs at least one of these first</legend>
                <p className="mt-0.5 text-[12px] text-muted">Set by you; nothing is guessed.</p>
                <div className="mt-2 space-y-1.5">
                  {services.filter((other) => other.id !== open.id).map((other) => (
                    <label key={other.id} className="flex items-center gap-2 text-[14px] text-ink-2">
                      <input type="checkbox" data-testid={`dependsOn-${other.id}`} checked={(open.dependsOnAny ?? []).includes(other.id)} onChange={(event) => edit(index, { dependsOnAny: event.target.checked ? [...(open.dependsOnAny ?? []), other.id] : (open.dependsOnAny ?? []).filter((id) => id !== other.id) })} /> {other.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="space-y-2 text-[14px] text-ink-2">
                <legend className="text-[13px] font-semibold text-ink">In a smaller offer</legend>
                <label className="flex items-center gap-2"><input data-testid="removable" type="checkbox" checked={open.removable} onChange={(e) => edit(index, { removable: e.target.checked })} /> Can be left out</label>
                <label className="flex items-center gap-2"><input data-testid="deferrable" type="checkbox" checked={open.deferrable} onChange={(e) => edit(index, { deferrable: e.target.checked })} /> Can start later</label>
                <label className="flex items-center gap-2"><input data-testid="independent" type="checkbox" checked={open.hasIndependentValue} onChange={(e) => edit(index, { hasIndependentValue: e.target.checked })} /> Useful to the buyer on its own</label>
              </fieldset>
              <p data-testid="costTiming" className="text-[12px] text-muted">You pay this cost at the start of each month of work.</p>
            </div>
            <div className="border-t border-line px-5 py-3"><Button variant="primary" onClick={() => setEditing(null)} data-testid="rules-done">Done</Button></div>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}
