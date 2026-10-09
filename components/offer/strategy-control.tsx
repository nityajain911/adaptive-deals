"use client";

import { InfoButton } from "../info-button";
import { useState } from "react";
import { useAction, ErrorText } from "@/components/client";
import { STRATEGY_IDS, STRATEGY_LABEL, type StrategyId } from "@/domain/strategy";
import { cx } from "../ui";

export const STRATEGY_HELP: Record<StrategyId, string> = {
  protect_contribution: "Suggests an offer the buyer can approve, then the one where you keep the most.",
  preserve_scope: "Keeps as much of your original quote as possible, then the most you keep.",
  minimise_cash_exposure: "Suggests the offer where you spend the least before you are paid.",
  lower_buyer_commitment: "Suggests an offer the buyer can approve, with no discount and the smallest payments.",
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
    <fieldset className="rounded-xl border border-line bg-surface px-4 py-2.5" data-testid="strategy-control" data-value={shown} disabled={disabled || pending}>
      <legend className="px-1 text-[13px] font-semibold text-ink">
        What matters most to you?
        <InfoButton label="What this priority means" testId="strategy-help-info">{STRATEGY_HELP[shown]}</InfoButton>
      </legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {STRATEGY_IDS.map((id) => (
          <label key={id} className={cx("flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] leading-5", shown === id ? "border-blue bg-blue-weak font-semibold text-ink" : "border-line text-ink-2 hover:bg-surface-muted")}>
            <input type="radio" name="strategy" checked={shown === id} onChange={() => { setChosen(id); run({ action: "set_strategy", strategy: id }); }} data-testid={`strategy-${id}`} />
            <span>{STRATEGY_LABEL[id]}</span>
          </label>
        ))}
      </div>
      <ErrorText error={error} />
    </fieldset>
  );
}
