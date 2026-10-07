"use client";

import { useState } from "react";
import { useAction, ErrorText } from "@/components/client";
import { STRATEGY_IDS, STRATEGY_LABEL, type StrategyId } from "@/domain/strategy";
import { cx } from "../ui";

export const STRATEGY_HELP: Record<StrategyId, string> = {
  protect_contribution: "Within the buyer's approval first, then the most you keep.",
  preserve_scope: "As much of the quoted scope as possible, then the most you keep.",
  minimise_cash_exposure: "The least you pay out before you are paid.",
  lower_buyer_commitment: "Within the buyer's approval first, then no discount, then the smallest single payment.",
};

/**
 * How the feasible offers are ranked for this deal. It only re-orders offers the engine already
 * approved; it never adds one or relaxes a rule. Native radio inputs, so the arrow keys work.
 */
export function StrategyControl({ current, disabled = false }: { current: StrategyId; disabled?: boolean }) {
  const { run, pending, error } = useAction();
  // Show the choice at once; the page re-renders with the server's answer, and a refusal puts the old choice back.
  const [chosen, setChosen] = useState<StrategyId>(current);
  const shown = error ? current : chosen;
  return (
    <fieldset className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3" data-testid="strategy-control" data-value={shown} disabled={disabled || pending}>
      <legend className="px-1 text-[13px] font-semibold uppercase tracking-wide text-muted">Strategy</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {STRATEGY_IDS.map((id) => (
          <label key={id} className={cx("flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-[14px] leading-5", shown === id ? "border-blue bg-blue-weak font-semibold text-ink" : "border-line text-ink-2 hover:bg-surface-muted")}>
            <input type="radio" name="strategy" className="mt-1" checked={shown === id} onChange={() => { setChosen(id); run({ action: "set_strategy", strategy: id }); }} data-testid={`strategy-${id}`} />
            <span>{STRATEGY_LABEL[id]}</span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-[13px] text-muted" data-testid="strategy-help">{STRATEGY_HELP[shown]}</p>
      <ErrorText error={error} />
    </fieldset>
  );
}
