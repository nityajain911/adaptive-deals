"use client";

import { formatINR } from "@/domain/money";
import { ActionButton, PrimaryActionButton } from "../client";

export interface FollowOnReviewProps {
  label: string;
  /** The buyer's own go-ahead test, in their words, when they set one. */
  condition: string | null;
  /** What the buyer said when the pilot ended: their decision and their words. Null until they have answered. */
  buyer: { decision: "proceed" | "stop" | "changes" | "unclear"; text: string } | null;
  /** What the change they asked for would come to; null when they asked for none, or it would not pass the rules. */
  change: { removedName: string; totalPaise: number; within: boolean } | null;
  heldTotalPaise: number;
}

/**
 * The month-three review. The buyer's own answer decides what the owner is asked to do: carry on (send), carry on with a change
 * (send as asked, send as held, or close), or stop (close). With no answer, the owner judges the buyer's condition. The product never
 * decides for the owner.
 */
export function FollowOnReview({ label, condition, buyer, change, heldTotalPaise }: FollowOnReviewProps) {
  const decision = buyer?.decision ?? null;
  return (
    <div className="w-full space-y-2" data-testid="follow-on-review">
      {buyer ? (
        <p className="text-[14px] text-ink-2" data-testid="follow-on-buyer-reply">
          The buyer said: “{buyer.text}”
        </p>
      ) : null}
      {decision === "stop" ? (
        <div className="flex flex-wrap items-center gap-3">
          <PrimaryActionButton body={{ action: "close_follow_on" }}>{label}</PrimaryActionButton>
        </div>
      ) : decision === "changes" ? (
        <>
          <p className="text-[14px] text-ink-2" data-testid="follow-on-change">
            {change ? `Without ${change.removedName}, the rest of the year is ${formatINR(change.totalPaise)} including GST${change.within ? ", within their approval limit" : ""}.` : "That change does not pass your rules, so it cannot be offered."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {change ? <PrimaryActionButton body={{ action: "send_follow_on", applyChange: true }}>{`Send without ${change.removedName} · ${formatINR(change.totalPaise)}`}</PrimaryActionButton> : null}
            <ActionButton body={{ action: "send_follow_on", conditionMet: true }} variant="secondary" testId="send-as-held">{`Send as held · ${formatINR(heldTotalPaise)}`}</ActionButton>
            <ActionButton body={{ action: "close_follow_on" }} variant="secondary" testId="close-follow-on">Close after the first phase</ActionButton>
          </div>
        </>
      ) : (
        <>
          {condition && decision !== "proceed" ? (
            <p className="text-[14px] text-ink-2" data-testid="follow-on-condition">
              Their condition: “{condition}” <span className="text-muted">Sending confirms you checked it was met.</span>
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <PrimaryActionButton body={{ action: "send_follow_on", conditionMet: true }}>{label}</PrimaryActionButton>
            {decision !== "proceed" ? (
              <ActionButton body={{ action: "close_follow_on" }} variant="secondary" testId="close-follow-on">
                {condition ? "Not met · close after the first phase" : "Close after the first phase"}
              </ActionButton>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
