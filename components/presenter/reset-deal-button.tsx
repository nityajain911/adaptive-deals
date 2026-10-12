"use client";

import { useRouter } from "next/navigation";
import { ErrorText, useAction } from "../client";

/** Start the open case again from step 1. The merchant's prices and costs are not touched. */
export function ResetDealButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        data-testid="presenter-reset-deal"
        className="flex min-h-9 w-full items-center justify-center rounded-lg border border-white/30 px-3 text-[13px] font-semibold text-white hover:bg-white/10 disabled:opacity-60"
        onClick={() => {
          if (!window.confirm("Start this deal again from step 1? Your prices and costs are not changed.")) return;
          run({ action: "start_case", caseId }, () => { router.push("/deals/hero/understand"); router.refresh(); });
        }}
      >
        {pending ? "Resetting…" : "Reset this deal to step 1"}
      </button>
      <ErrorText error={error} />
    </div>
  );
}
