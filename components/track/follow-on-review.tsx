"use client";

import { formatDate } from "@/domain/dates";
import { formatINR } from "@/domain/money";
import { ActionButton, PrimaryActionButton } from "../client";

export interface FollowOnReviewProps {
  label: string;
  /** The buyer's own go-ahead test, in their words, when they set one. */
  condition: string | null;
  /** What the buyer said when the pilot ended: their decision and their words. Null until they have answered. */
  buyer: { decision: "proceed" | "stop" | "changes" | "unclear"; text: string } | null;
  /** The change they asked for, and what the merchant can offer that meets it. Null unless they asked to carry on with a change. */
  change: { request: string; options: { id: string; label: string; totalPaise: number; instalments: number; within: boolean; firstPaymentDate: string }[] } | null;
  heldTotalPaise: number;
}

/**
 * The month-three review. The buyer's own answer decides what the owner is asked to do, and nothing else is offered:
 * - they carry on: send (no way out is shown);
 * - they carry on with a change: the options that meet it, or send as held (no way out is shown);
 * - they stop: close;
 * - no answer, or one in their own words: the owner reads it and judges their condition, and may close.
 * The product never decides for the owner.
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
            {change ? change.request : "They asked for a change."}{" "}
            {change?.options.length ? "These meet it:" : "None of your approved offers meets that, so you can send the rest of the year as held."}
          </p>
          {change?.options.length ? (
            <ul className="space-y-2" data-testid="follow-on-options">
              {change.options.map((option, i) => (
                <li key={option.id} className="flex flex-wrap items-center gap-3">
                  {i === 0 ? (
                    <PrimaryActionButton body={{ action: "send_follow_on", optionId: option.id }}>{`Send · ${option.label} · ${formatINR(option.totalPaise)}`}</PrimaryActionButton>
                  ) : (
                    <ActionButton body={{ action: "send_follow_on", optionId: option.id }} variant="secondary" testId={`follow-on-option-${option.id}`}>{`Send · ${option.label} · ${formatINR(option.totalPaise)}`}</ActionButton>
                  )}
                  <span className="text-[13px] text-muted">{option.instalments} payments from {formatDate(option.firstPaymentDate)}{option.within ? " · within their approval limit" : ""}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            {change?.options.length ? (
              <ActionButton body={{ action: "send_follow_on", conditionMet: true }} variant="secondary" testId="send-as-held">{`Send as held · ${formatINR(heldTotalPaise)}`}</ActionButton>
            ) : (
              <PrimaryActionButton body={{ action: "send_follow_on", conditionMet: true }}>{`Send as held · ${formatINR(heldTotalPaise)}`}</PrimaryActionButton>
            )}
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
