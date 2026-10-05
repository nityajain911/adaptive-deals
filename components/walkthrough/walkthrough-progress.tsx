import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, EyeOff, RotateCcw } from "lucide-react";
import type { WalkthroughActor, WalkthroughProvenance, WalkthroughView } from "@/lib/walkthrough";
import { Button } from "@/components/client";

const ACTOR_LABEL: Record<WalkthroughActor, string> = {
  merchant: "Merchant action",
  buyer: "Buyer action",
  system: "Simulated system action",
  ai: "AI analysis",
  engine: "Deterministic engine",
};

const PROVENANCE_LABEL: Record<WalkthroughProvenance, string> = {
  live_groq: "Live Groq response",
  live_groq_replay: "Replay of an actual Groq run",
  synthetic_replay: "Synthetic replay",
  saved_groq_exact_match: "Saved Groq response · exact input match",
  deterministic_engine: "Deterministic engine calculation",
  merchant: "Merchant decision",
  simulated_buyer: "Simulated buyer action",
  razorpay_test_mode: "Razorpay Test Mode",
};

export function WalkthroughProgress({
  view,
  displayedObjectiveId,
  primaryLabel,
  primaryDisabled,
  onPrimary,
  onBack,
  onNext,
  onHide,
  onRestart,
  backHref,
}: {
  view: WalkthroughView;
  displayedObjectiveId: string;
  primaryLabel: string;
  primaryDisabled: boolean;
  onPrimary: () => void;
  onBack: () => void;
  onNext: () => void;
  onHide: () => void;
  onRestart: () => void;
  backHref?: string;
}) {
  const objective = view.objectives.find((item) => item.id === displayedObjectiveId) ?? view.objectives.find((item) => item.id === view.currentObjectiveId)!;
  const actionActor = displayedObjectiveId === view.currentObjectiveId ? view.currentAction?.actor : null;
  const actor = actionActor ? ACTOR_LABEL[actionActor] : ACTOR_LABEL[objective.actor];
  const index = view.objectives.findIndex((item) => item.id === objective.id);
  const currentIndex = view.objectives.findIndex((item) => item.id === view.currentObjectiveId);
  const core = view.objectives.filter((item) => !item.optional);
  const coreIndex = core.findIndex((item) => item.id === objective.id);
  const displayedStepLabel = objective.optional ? "Explore another product capability" : `Step ${coreIndex + 1} of ${core.length}`;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-5 py-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue">DEMO WALKTHROUGH · {displayedStepLabel.toUpperCase()}</div>
        <h2 id="walkthrough-heading" tabIndex={-1} className="mt-2 text-[20px] font-bold tracking-tight text-ink">{objective.title}</h2>
        <div className="mt-2 inline-flex rounded-full border border-line bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-ink-2">{actor}</div>
        {displayedObjectiveId === view.currentObjectiveId && view.provenance ? <div className="mt-2 text-[12px] text-muted">{PROVENANCE_LABEL[view.provenance]}</div> : null}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <p id="walkthrough-instruction" className="text-[14px] leading-6 text-ink">{objective.instruction}</p>
        <div className="mt-4 rounded-xl border border-[#d6defe] bg-blue-weak px-4 py-3">
          <div className="text-[12px] font-semibold text-blue-ink">What to notice</div>
          <p className="mt-1 text-[13px] leading-5 text-ink-2">{objective.notice}</p>
        </div>
        {displayedObjectiveId === view.currentObjectiveId && view.terminalOutcome ? <p className="mt-4 rounded-xl border border-line bg-surface-muted px-4 py-3 text-[13px] text-ink">{view.terminalOutcome}</p> : null}

        <Button variant="primary" className="mt-5 w-full" onClick={onPrimary} disabled={primaryDisabled} data-walkthrough-primary="true">
          {primaryLabel}
        </Button>

        <details className="mt-5 border-t border-line pt-3">
          <summary className="cursor-pointer text-[13px] font-semibold text-ink">Walkthrough progress</summary>
          <ol className="mt-3 space-y-2 text-[12px]">
            {view.objectives.map((item) => {
              const done = view.completedObjectiveIds.includes(item.id);
              const current = item.id === view.currentObjectiveId;
              return (
                <li key={item.id} className="flex items-start gap-2 text-ink-2">
                  <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${done ? "border-green bg-green text-white" : current ? "border-blue text-blue" : "border-line text-muted"}`}>
                    {done ? <Check aria-hidden className="h-3 w-3" /> : current ? "•" : ""}
                  </span>
                  <span>{item.title}{item.optional ? " · optional" : ""}</span>
                </li>
              );
            })}
          </ol>
        </details>
      </div>

      <div className="border-t border-line px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={onBack} disabled={index <= 0}><ChevronLeft aria-hidden className="h-4 w-4" /> Back</Button>
          <Button variant="ghost" onClick={onNext} disabled={index >= currentIndex}>Next <ChevronRight aria-hidden className="h-4 w-4" /></Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px]">
          <button type="button" className="inline-flex items-center gap-1 font-semibold text-muted hover:text-ink" onClick={onHide}><EyeOff aria-hidden className="h-3.5 w-3.5" /> Hide</button>
          <button type="button" className="inline-flex items-center gap-1 font-semibold text-muted hover:text-ink" onClick={onRestart}><RotateCcw aria-hidden className="h-3.5 w-3.5" /> Restart</button>
        </div>
        {backHref ? <Link href={backHref} className="mt-3 block text-center text-[12px] font-semibold text-blue hover:underline">Back to merchant view</Link> : null}
      </div>
    </div>
  );
}
