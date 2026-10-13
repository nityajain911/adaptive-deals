"use client";

import { ActionButton, PrimaryActionButton } from "../client";

/**
 * The month-three review. The buyer's own condition is shown in their words, and the merchant, who is the one who can judge it, either
 * sends the rest of the year (which confirms it was met) or closes after the first phase. The product never decides whether it was met.
 */
export function FollowOnReview({ label, condition }: { label: string; condition: string | null }) {
  return (
    <div className="w-full space-y-2" data-testid="follow-on-review">
      {condition ? (
        <p className="text-[14px] text-ink-2" data-testid="follow-on-condition">
          Their condition: “{condition}” <span className="text-muted">Sending confirms you checked it was met.</span>
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <PrimaryActionButton body={{ action: "send_follow_on", conditionMet: true }}>{label}</PrimaryActionButton>
        {condition ? (
          <ActionButton body={{ action: "close_follow_on" }} variant="secondary" testId="close-follow-on">
            Not met · close after the first phase
          </ActionButton>
        ) : null}
      </div>
    </div>
  );
}
