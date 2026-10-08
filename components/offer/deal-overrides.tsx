"use client";

import { useState } from "react";
import { Button, ErrorText, useAction } from "@/components/client";
import type { ContributionFloor } from "@/domain/types";
import type { InputOverride, OverrideField } from "@/lib/deal-economics";
import { OVERRIDE_DIRECTION_TEXT, OVERRIDE_FIELD_LABEL, overrideValueText } from "@/lib/override-copy";
import { rupeesInput, toNonNegativePaise } from "@/lib/money-input";
import { Badge } from "../ui";

export interface OverrideAccount {
  services: { id: string; name: string; costPaise: number }[];
  floor: ContributionFloor;
  cashPaise: number;
  discountBps: number;
}

type Choice = `direct_cost:${string}` | Exclude<OverrideField, "direct_cost">;

const input = "mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[14px] text-ink";
const percentToBps = (text: string) => (/^\d+(\.\d{1,2})?$/.test(text.trim()) ? Math.round(Number(text) * 100) : null);

/**
 * Change one assumption for this deal only, with a reason. The account's business economics are
 * not changed, and a quoted price cannot be overridden.
 */
export function DealOverrides({ account, overrides, locked = false }: { account: OverrideAccount; overrides: InputOverride[]; locked?: boolean }) {
  const { run, pending, error } = useAction();
  const [choice, setChoice] = useState<Choice>(`direct_cost:${account.services[0]?.id ?? ""}`);
  const [value, setValue] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const field: OverrideField = choice.startsWith("direct_cost:") ? "direct_cost" : (choice as Exclude<OverrideField, "direct_cost">);
  const packageId = choice.startsWith("direct_cost:") ? choice.slice("direct_cost:".length) : undefined;
  const nameOf = (id?: string) => account.services.find((s) => s.id === id)?.name ?? id ?? "";
  const labelOf = (o: Pick<InputOverride, "field" | "packageId">) => (o.field === "direct_cost" ? `${nameOf(o.packageId)} · delivery cost` : OVERRIDE_FIELD_LABEL[o.field]);

  const accountText = field === "direct_cost" ? overrideValueText(field, account.services.find((s) => s.id === packageId)?.costPaise ?? 0)
    : field === "cash_exposure" ? overrideValueText(field, account.cashPaise)
    : field === "discount_limit" ? overrideValueText(field, account.discountBps)
    : overrideValueText(field, account.floor);

  const parsed = (): number | ContributionFloor | null => {
    if (field === "direct_cost" || field === "cash_exposure") return toNonNegativePaise(value);
    if (field === "discount_limit") return percentToBps(value);
    const minPercentBps = value.trim() ? percentToBps(value) : null;
    const minPaise = amount.trim() ? toNonNegativePaise(amount) : null;
    if ((value.trim() && minPercentBps === null) || (amount.trim() && minPaise === null) || (minPercentBps === null && minPaise === null)) return null;
    return { minPercentBps, minPaise, combine: account.floor.combine };
  };
  const next = parsed();
  const ready = next !== null && reason.trim().length >= 5;

  return (
    <details className="rounded-[var(--radius-card)] border border-line bg-surface" data-testid="deal-overrides" open={overrides.length > 0 || undefined}>
      <summary className="cursor-pointer px-5 py-3 text-[15px] font-semibold text-ink">
        Change a number for this deal {overrides.length ? <Badge tone="amber">{overrides.length} applied</Badge> : null}
      </summary>
      <div className="space-y-4 border-t border-line px-5 py-4">
        {overrides.length ? (
          <ul className="space-y-2" data-testid="override-list">
            {overrides.map((o) => (
              <li key={o.id} className="rounded-xl border border-line px-4 py-3 text-[14px]" data-testid={`override-${o.field}${o.packageId ? `-${o.packageId}` : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink">{labelOf(o)}: {overrideValueText(o.field, o.accountValue)} → {overrideValueText(o.field, o.value)}</span>
                  <Badge tone={o.direction === "loosens" ? "amber" : o.direction === "tightens" ? "blue" : "neutral"}>{OVERRIDE_DIRECTION_TEXT[o.direction]}</Badge>
                </div>
                <p className="mt-1 text-[13px] text-ink-2">Reason: {o.reason}</p>
                {!locked ? <Button className="mt-2" disabled={pending} data-testid={`override-remove-${o.id}`} onClick={() => run({ action: "remove_input_override", id: o.id })}>Remove</Button> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {!locked ? (
          <form
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!ready || next === null) return;
              run({ action: "add_input_override", field, packageId, value: next, reason: reason.trim() }, () => { setValue(""); setAmount(""); setReason(""); });
            }}
          >
            <label className="text-[13px] font-semibold text-muted sm:col-span-2">What to adjust
              <select className={input} value={choice} onChange={(e) => { setChoice(e.target.value as Choice); setValue(""); setAmount(""); }} data-testid="override-field">
                {account.services.map((s) => <option key={s.id} value={`direct_cost:${s.id}`}>{s.name} · delivery cost</option>)}
                <option value="contribution_floor">{OVERRIDE_FIELD_LABEL.contribution_floor}</option>
                <option value="cash_exposure">{OVERRIDE_FIELD_LABEL.cash_exposure}</option>
                <option value="discount_limit">{OVERRIDE_FIELD_LABEL.discount_limit}</option>
              </select>
              <span className="mt-1 block text-[13px] font-normal text-muted" data-testid="override-account">Your prices & costs say: {accountText}</span>
            </label>
            <label className="text-[13px] font-semibold text-muted">{field === "discount_limit" || field === "contribution_floor" ? "Percentage (%)" : "Amount (₹)"}
              <input className={input} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={field === "direct_cost" ? rupeesInput(account.services.find((s) => s.id === packageId)?.costPaise ?? null) : undefined} data-testid="override-value" />
            </label>
            {field === "contribution_floor" ? (
              <label className="text-[13px] font-semibold text-muted">Or amount (₹)
                <input className={input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="override-amount" />
              </label>
            ) : null}
            <label className="text-[13px] font-semibold text-muted sm:col-span-2">Reason for this deal
              <input className={input} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="A short reason you can read back later" data-testid="override-reason" />
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary" disabled={pending || !ready} data-testid="override-apply">{pending ? "Applying…" : "Apply to this deal"}</Button>
            </div>
          </form>
        ) : null}
        <ErrorText error={error} />
        <p className="text-[13px] text-muted">This changes this deal only. Your prices & costs are not changed, and the prices quoted to the buyer cannot be overridden.</p>
      </div>
    </details>
  );
}
