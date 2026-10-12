"use client";

import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button, ErrorText, useAction } from "../client";

/**
 * Send the exact previewed terms (spec §5.3). One click runs approval then delivery; a failed delivery returns to the Offer
 * stage with Retry sending, never reported as sent. It sits beside the drafted message, as the send button of a chat.
 */
export function PreviewActions({ dealId, version, termsHash }: { dealId: string; version: number; termsHash: string }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="primary"
        className="min-h-10 gap-1.5 rounded-full px-4 text-[14px]"
        data-testid="primary-action"
        disabled={pending}
        onClick={() =>
          run({ action: "approve_and_send_draft", version, termsHash }, (r) => {
            const delivered = (r as { delivered?: boolean } | null)?.delivered;
            router.push(delivered ? `/deals/${dealId}/track` : `/deals/${dealId}/offer`);
          })
        }
      >
        <Send aria-hidden className="h-4 w-4" />
        {pending ? "Sending…" : "Send offer"}
      </Button>
      <ErrorText error={error} />
    </div>
  );
}
