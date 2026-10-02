"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, ErrorText, useAction } from "../client";

/**
 * Approve the exact previewed terms and attempt delivery (spec §5.3). One click runs approval then
 * delivery; a failed delivery returns to the Offer stage with Retry sending, never reported as sent.
 */
export function PreviewActions({ dealId, version, termsHash }: { dealId: string; version: number; termsHash: string }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          className="min-h-11 px-5 text-[14px]"
          data-testid="primary-action"
          disabled={pending}
          onClick={() =>
            run({ action: "approve_and_send_draft", version, termsHash }, (r) => {
              const delivered = (r as { delivered?: boolean } | null)?.delivered;
              router.push(delivered ? `/deals/${dealId}/track` : `/deals/${dealId}/offer`);
            })
          }
        >
          {pending ? "Approving and sending…" : "Approve and send to buyer"}
        </Button>
        <Link href={`/deals/${dealId}/offer`} className="text-[14px] font-semibold text-blue hover:underline" data-testid="back-to-offer">
          Back to offer
        </Link>
      </div>
      <ErrorText error={error} />
    </div>
  );
}
