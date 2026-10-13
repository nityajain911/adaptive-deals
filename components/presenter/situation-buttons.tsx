"use client";

import { useRouter } from "next/navigation";
import { Button, ErrorText, useAction } from "../client";
import type { CaseId } from "@/data/synthetic/cases";

const SITUATIONS: { id: CaseId; label: string; sub: string; testId: string }[] = [
  { id: "reduced-scope", label: "Start small", sub: "Pilot first, rest of the year held", testId: "situation-reduced-scope" },
  { id: "preserve-scope", label: "Asks for a discount", sub: "Only for something in return", testId: "situation-preserve-scope" },
  { id: "no-fit", label: "Cheaper quote", sub: "Won't match it, offers what fits", testId: "situation-no-fit" },
];

/** The half-second fallback: open any of the three buyer situations, each replaying its recorded model run. */
export function SituationButtons() {
  const router = useRouter();
  const { run, pending, error } = useAction();
  return (
    <div data-testid="situation-buttons">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SITUATIONS.map((situation) => (
          <li key={situation.id}>
            <Button variant="primary" className="min-h-16 w-full flex-col rounded-xl px-4 text-center" disabled={pending} data-testid={situation.testId} onClick={() => run({ action: "open_deal", caseId: situation.id }, () => { router.push("/deals/hero"); router.refresh(); })}>
              <span className="block text-[16px] font-bold leading-6">{situation.label}</span>
              <span className="block text-[12px] font-medium opacity-90">{situation.sub}</span>
            </Button>
          </li>
        ))}
      </ul>
      <ErrorText error={error} />
    </div>
  );
}
