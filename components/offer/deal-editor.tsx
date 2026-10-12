"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button, ErrorText } from "@/components/client";
import type { ContributionFloor } from "@/domain/types";
import type { InputOverride, OverrideField } from "@/lib/deal-economics";
import { OVERRIDE_DIRECTION_TEXT, OVERRIDE_FIELD_LABEL, overrideValueText } from "@/lib/override-copy";
import { rupeesInput, toNonNegativePaise } from "@/lib/money-input";
import { MoneySplit } from "./money-split";

export interface EditorAccount {
  services: { id: string; name: string; costPaise: number }[];
  /** What the account's prices & costs say. */
  floor: ContributionFloor;
  cashPaise: number;
  discountBps: number;
  /** What applies to this deal now, after any overrides. */
  effective: { floor: ContributionFloor; cashPaise: number; discountBps: number };
}

/** A ruled-out offer that failed only on the profit limit: the limit at which it would work. */
export interface UnlockStop {
  bps: number;
  label: string;
  keepPaise: number;
}

type Body = { action: "add_input_override"; field: OverrideField; packageId?: string; value: number | ContributionFloor; reason: string } | { action: "remove_input_override"; id: string };

/** Sends overrides one after the other; stops at the first the server refuses. */
function useSend() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (bodies: Body[], done?: () => void) => {
    setPending(true);
    setError(null);
    try {
      for (const body of bodies) {
        const res = await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const json = (await res.json()) as { ok: boolean; error?: string };
        if (!json.ok) {
          setError(json.error ?? "Action failed");
          return;
        }
      }
      done?.();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  };
  return { send, pending, error };
}

const field = "h-9 w-28 rounded-lg border border-line-strong bg-surface px-2 text-right text-[14px] text-ink";
const percentToBps = (text: string) => (/^\d+(\.\d{1,2})?$/.test(text.trim()) ? Math.round(Number(text) * 100) : null);
const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;

export function CustomizedTag() {
  return <span className="ml-1.5 rounded-md bg-amber-weak px-1.5 py-0.5 text-[11px] font-medium text-amber" data-testid="customized-tag">Customized</span>;
}

/** The overrides already on this deal, with a way to take each, or all, back. */
function CustomizedStrip({ account, overrides, locked }: { account: EditorAccount; overrides: InputOverride[]; locked: boolean }) {
  const { send, pending, error } = useSend();
  const nameOf = (id?: string) => account.services.find((s) => s.id === id)?.name ?? id ?? "";
  const labelOf = (o: InputOverride) => (o.field === "direct_cost" ? `${nameOf(o.packageId)} · delivery cost` : OVERRIDE_FIELD_LABEL[o.field]);
  if (!overrides.length) return null;
  return (
    <details className="mb-3 rounded-lg bg-amber-weak px-3 py-2 text-[13px]" data-testid="deal-overrides" open>
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 font-medium text-amber">
        <span>Customized for this deal · {overrides.length} {overrides.length === 1 ? "change" : "changes"}</span>
        {!locked ? <button type="button" className="font-normal underline" disabled={pending} data-testid="override-undo-all" onClick={(e) => { e.preventDefault(); send(overrides.map((o) => ({ action: "remove_input_override", id: o.id }))); }}>Undo all</button> : null}
      </summary>
      <ul className="mt-2 space-y-2 text-ink-2" data-testid="override-list">
        {overrides.map((o) => (
          <li key={o.id} data-testid={`override-${o.field}${o.packageId ? `-${o.packageId}` : ""}`}>
            <div className="font-medium text-ink">{labelOf(o)}: {overrideValueText(o.field, o.accountValue)} → {overrideValueText(o.field, o.value)}</div>
            <div>{OVERRIDE_DIRECTION_TEXT[o.direction]} · {o.reason}</div>
            {!locked ? <button type="button" className="underline" disabled={pending} data-testid={`override-remove-${o.id}`} onClick={() => send([{ action: "remove_input_override", id: o.id }])}>Remove</button> : null}
          </li>
        ))}
      </ul>
      <ErrorText error={error} />
    </details>
  );
}

function Reason({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2 text-[14px] text-ink" value={value} maxLength={300} onChange={(e) => onChange(e.target.value)} placeholder="Reason, for the record" aria-label="Reason for this deal" data-testid="override-reason" />;
}

/** Delivery cost per service, each with the account's usual figure beside it. Only the amounts that changed are sent. */
function DeliveryEditor({ account, done }: { account: EditorAccount; done: () => void }) {
  const { send, pending, error } = useSend();
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const changes = account.services.flatMap((s) => {
    const text = values[s.id];
    if (text === undefined || text.trim() === "") return [];
    const paise = toNonNegativePaise(text);
    return paise === null || paise === s.costPaise ? [] : [{ id: s.id, paise }];
  });
  const invalid = account.services.some((s) => values[s.id]?.trim() && toNonNegativePaise(values[s.id]!) === null);
  const ready = changes.length > 0 && !invalid && reason.trim().length >= 5;
  return (
    <div className="mt-2 rounded-xl border border-line-strong bg-surface-muted p-3" data-testid="delivery-editor">
      {account.services.map((s) => (
        <label key={s.id} className="flex items-center justify-between gap-3 py-1 text-[14px] text-ink">
          <span>{s.name}</span>
          <span className="flex items-center gap-2 text-[13px] text-muted">
            usual ₹{(s.costPaise / 100).toLocaleString("en-IN")}
            <input className={field} inputMode="decimal" value={values[s.id] ?? ""} placeholder={rupeesInput(s.costPaise)} onChange={(e) => setValues((v) => ({ ...v, [s.id]: e.target.value }))} aria-label={`${s.name} delivery cost`} data-testid={`cost-${s.id}`} />
          </span>
        </label>
      ))}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Reason value={reason} onChange={setReason} />
        <Button variant="primary" disabled={pending || !ready} data-testid="override-apply" onClick={() => send(changes.map((c) => ({ action: "add_input_override", field: "direct_cost", packageId: c.id, value: c.paise, reason: reason.trim() })), () => { setValues({}); setReason(""); done(); })}>{pending ? "Applying…" : "Apply"}</Button>
      </div>
      <div className="mt-1 text-[12px] text-muted">This deal only</div>
      <ErrorText error={error} />
    </div>
  );
}

type Limit = "contribution_floor" | "cash_exposure" | "discount_limit";

/** The three limits for this deal. The profit limit gets a slider that stops where a ruled-out offer would start to work. */
export function LimitsEditor({ account, stops, done }: { account: EditorAccount; stops: UnlockStop[]; done: () => void }) {
  const { send, pending, error } = useSend();
  const [which, setWhich] = useState<Limit>("contribution_floor");
  const [value, setValue] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [slide, setSlide] = useState<number | null>(null);
  const eff = account.effective;
  const sliderOk = account.effective.floor.minPaise === null && account.effective.floor.minPercentBps !== null && stops.length > 0;
  const stopBps = stops.map((s) => s.bps);
  const lo = Math.min(...stopBps, eff.floor.minPercentBps ?? 0);
  const hi = eff.floor.minPercentBps ?? 0;
  const current = slide ?? hi;
  const unlocked = stops.filter((s) => s.bps >= current);
  const snap = (v: number) => stopBps.find((b) => Math.abs(b - v) <= 40) ?? v;

  const next = (): number | ContributionFloor | null => {
    if (which === "cash_exposure") return toNonNegativePaise(value);
    if (which === "discount_limit") return percentToBps(value);
    if (sliderOk && slide !== null) return slide === hi ? null : { minPercentBps: slide, minPaise: null, combine: eff.floor.combine };
    const bps = value.trim() ? percentToBps(value) : null;
    const paise = amount.trim() ? toNonNegativePaise(amount) : null;
    if ((value.trim() && bps === null) || (amount.trim() && paise === null) || (bps === null && paise === null)) return null;
    return { minPercentBps: bps, minPaise: paise, combine: eff.floor.combine };
  };
  const target = next();
  const ready = target !== null && reason.trim().length >= 5;
  const row = (id: Limit, label: string, shown: string, usual: string, changed: boolean) => (
    <button key={id} type="button" className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[14px] hover:bg-surface ${which === id ? "bg-surface" : ""}`} onClick={() => { setWhich(id); setValue(""); setAmount(""); setSlide(null); }} data-testid={`limit-${id}`}>
      <span className="text-ink">{label}</span>
      <span className="flex items-center text-ink">
        {changed ? <span className="mr-1 text-muted line-through">{usual}</span> : null}{shown}{changed ? <CustomizedTag /> : null}
        <Pencil aria-hidden className="ml-2 h-3.5 w-3.5 text-muted" />
      </span>
    </button>
  );
  const sameFloor = JSON.stringify(account.floor) === JSON.stringify(eff.floor);
  return (
    <div className="mt-2 rounded-xl border border-line-strong bg-surface-muted p-3" data-testid="limits-editor">
      {row("contribution_floor", OVERRIDE_FIELD_LABEL.contribution_floor, overrideValueText("contribution_floor", eff.floor), overrideValueText("contribution_floor", account.floor), !sameFloor)}
      {row("cash_exposure", OVERRIDE_FIELD_LABEL.cash_exposure, overrideValueText("cash_exposure", eff.cashPaise), overrideValueText("cash_exposure", account.cashPaise), eff.cashPaise !== account.cashPaise)}
      {row("discount_limit", OVERRIDE_FIELD_LABEL.discount_limit, overrideValueText("discount_limit", eff.discountBps), overrideValueText("discount_limit", account.discountBps), eff.discountBps !== account.discountBps)}
      <div className="mt-2 border-t border-line pt-2">
        {which === "contribution_floor" && sliderOk ? (
          <div data-testid="floor-slider">
            <div className="px-1 pt-1">
              <input type="range" className="w-full accent-[var(--amber)]" min={lo} max={hi} step={1} value={current} onChange={(e) => setSlide(snap(Number(e.target.value)))} aria-label="Lowest profit for this deal" data-testid="floor-range" />
            </div>
            <div className="flex items-baseline justify-between text-[13px] text-ink-2">
              <span data-testid="floor-value">{pct(current)}</span>
              <span className="text-muted">your usual {pct(account.floor.minPercentBps ?? hi)}</span>
            </div>
            <ul className="mt-1 space-y-0.5 text-[13px] text-ink" data-testid="floor-unlocks">
              {unlocked.length ? unlocked.map((s) => <li key={s.bps}>You could send: {s.label} · keeps about ₹{Math.round(s.keepPaise / 100).toLocaleString("en-IN")}</li>) : <li className="text-muted">Nothing fits yet. Drag lower.</li>}
            </ul>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-[14px] text-ink">
            <label className="flex items-center gap-2">{which === "cash_exposure" ? "Amount (₹)" : "Percentage (%)"}
              <input className={field} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} data-testid="override-value" />
            </label>
            {which === "contribution_floor" ? (
              <label className="flex items-center gap-2">or amount (₹)
                <input className={field} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="override-amount" />
              </label>
            ) : null}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Reason value={reason} onChange={setReason} />
          <Button variant="primary" disabled={pending || !ready} data-testid="override-apply" onClick={() => target !== null && send([{ action: "add_input_override", field: which, value: target, reason: reason.trim() }], () => { setValue(""); setAmount(""); setReason(""); setSlide(null); done(); })}>{pending ? "Applying…" : "Apply"}</Button>
        </div>
        <div className="mt-1 text-[12px] text-muted">This deal only</div>
        <ErrorText error={error} />
      </div>
    </div>
  );
}

/** The profit breakdown with the levers on it: a pencil on delivery costs and an "Edit limits" link, each opening its editor in place. */
export function EditableBreakdown({ split, account, overrides, stops, locked = false, limitsLine }: { split: { gstPaise: number; costsPaise: number; feesPaise: number; keepPaise: number }; account: EditorAccount; overrides: InputOverride[]; stops: UnlockStop[]; locked?: boolean; limitsLine: ReactNode }) {
  const [open, setOpen] = useState<"costs" | "limits" | null>(null);
  const customizedCosts = overrides.some((o) => o.field === "direct_cost");
  const customizedLimits = overrides.some((o) => o.field !== "direct_cost");
  return (
    <div>
      <CustomizedStrip account={account} overrides={overrides} locked={locked} />
      <div className="mb-1 flex flex-wrap items-center justify-end gap-x-3 text-[13px]">
        {limitsLine}
        {customizedLimits ? <CustomizedTag /> : null}
        {!locked ? (
          <button type="button" className="inline-flex items-center gap-1 text-ink-2 underline decoration-dashed underline-offset-4 hover:text-ink" aria-expanded={open === "limits"} onClick={() => setOpen(open === "limits" ? null : "limits")} data-testid="edit-limits">
            Edit limits <Pencil aria-hidden className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      <MoneySplit
        {...split}
        costsExtra={
          <>
            {customizedCosts ? <CustomizedTag /> : null}
            {!locked ? (
              <button type="button" className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-surface-muted hover:text-ink" aria-label="Edit delivery costs" aria-expanded={open === "costs"} onClick={() => setOpen(open === "costs" ? null : "costs")} data-testid="edit-costs">
                <Pencil aria-hidden className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </>
        }
      />
      {open === "costs" ? <DeliveryEditor account={account} done={() => setOpen(null)} /> : null}
      {open === "limits" ? <LimitsEditor account={account} stops={stops} done={() => setOpen(null)} /> : null}
    </div>
  );
}

/** The same limits editor for a screen that has no offer to hang it on. */
export function StandaloneLimits({ account, overrides, stops }: { account: EditorAccount; overrides: InputOverride[]; stops: UnlockStop[] }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4" data-testid="standalone-limits">
      <CustomizedStrip account={account} overrides={overrides} locked={false} />
      <h2 className="text-[14px] font-semibold text-ink">Limits for this deal</h2>
      <LimitsEditor account={account} stops={stops} done={() => undefined} />
    </div>
  );
}
