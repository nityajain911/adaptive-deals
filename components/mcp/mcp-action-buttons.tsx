"use client";

import { useRouter } from "next/navigation";
import { Button, ErrorText, useAction } from "@/components/client";

/** Review: derive the exact action from the accepted agreement. Nothing is sent to Razorpay yet except a read-only tool listing. */
export function PrepareMcpButton({ label = "Review Razorpay test Payment Link" }: { label?: string }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  return (
    <div>
      <Button variant="primary" disabled={pending} data-testid="mcp-prepare" onClick={() => run({ action: "prepare_mcp_collection" }, () => router.refresh())}>
        {pending ? "Checking Razorpay…" : label}
      </Button>
      <ErrorText error={error} />
    </div>
  );
}

/** Approve the exact reviewed action and create the test link in one step, as two checked calls. */
export function ApproveAndCreateButton({ intentId, approved }: { intentId: string; approved: boolean }) {
  const router = useRouter();
  const approve = useAction();
  const execute = useAction();
  const pending = approve.pending || execute.pending;
  const create = () => execute.run({ action: "execute_mcp_collection", intentId }, () => router.refresh());
  return (
    <div>
      <Button
        variant="primary"
        disabled={pending}
        data-testid="mcp-approve-create"
        onClick={() => (approved ? create() : approve.run({ action: "approve_mcp_collection", intentId }, create))}
      >
        {pending ? "Creating…" : approved ? "Create test Payment Link" : "Approve and create test Payment Link"}
      </Button>
      <ErrorText error={approve.error ?? execute.error} />
    </div>
  );
}
