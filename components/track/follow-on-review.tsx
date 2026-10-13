"use client";

import Link from "next/link";
import { ActionButton, PrimaryActionButton } from "../client";

export interface FollowOnReviewProps {
  label: string;
  /** The buyer's own go-ahead test, in their words, when they set one. */
  condition: string | null;
  /** What the buyer said when the pilot ended: their decision and their words. Null until they have answered. */
  buyer: { decision: "proceed" | "stop" | "changes" | "unclear"; text: string } | null;
  /** Where the owner compares what is committed with what the buyer's change would make it. */
  offerHref: string;
}

/**
 * The month-three review. The buyer's own answer decides what the owner is asked to do, and nothing else is offered:
 * - they carry on: send (no way out is shown);
 * - they carry on with a change: the offer screen, which compares what is committed with what the change makes it (no way out is shown);
 * - they stop: close;
 * - no answer, or one in their own words: the owner reads it and judges their condition, and may close.
 * The product never decides for the owner.
 */
export function FollowOnReview({ label, condition, buyer, offerHref }: FollowOnReviewProps) {
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
        <div className="flex flex-wrap items-center gap-3">
          <Link href={offerHref} className="inline-flex min-h-10 items-center rounded-lg bg-blue px-4 text-[14px] font-semibold text-white hover:bg-blue-ink" data-testid="primary-action">{label}</Link>
        </div>
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
