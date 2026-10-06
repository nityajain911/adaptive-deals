import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, EyeOff, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import type { WalkthroughActor, WalkthroughView } from "@/lib/walkthrough";
import { Button } from "@/components/client";

const ACTOR_LABEL: Record<WalkthroughActor, string> = {
  merchant: "Merchant action",
  buyer: "Buyer action",
  system: "Simulated system action",
  ai: "AI analysis",
  sample: "Sample analysis · written by hand",
  engine: "Deterministic engine",
};

export function WalkthroughProgress({
  view,
  displayedObjectiveId,
  primaryLabel,
  primaryTone = "navigate",
  yourTurn = null,
  onShowMe,
  primaryDisabled,
  onPrimary,
  onBack,
  onNext,
  onHide,
  onRestart,
  primaryControl,
  error,
  backHref,
}: {
  view: WalkthroughView;
  displayedObjectiveId: string;
  /** A button the guide itself performs: "Take me there", or a labelled simulation. */
  primaryLabel: string | null;
  primaryTone?: "navigate" | "simulate";
  /** The product button the person must click themselves. The guide has no button for it. */
  yourTurn?: { who: "merchant" | "buyer"; label: string | null } | null;
  onShowMe?: () => void;
  primaryDisabled: boolean;
  onPrimary: () => void;
  onBack: () => void;
  onNext: () => void;
  onHide: () => void;
  onRestart: () => void;
  primaryControl?: ReactNode;
  error?: string | null;
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
        {displayedObjectiveId === view.currentObjectiveId && view.provenanceLabel ? <div className="mt-2 text-[12px] text-muted" data-testid="walkthrough-provenance">{view.provenanceLabel}</div> : null}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {displayedObjectiveId === view.currentObjectiveId && view.subSteps ? (
          <ol className="mb-3 space-y-1.5" aria-label="Actions in this step" data-testid="walkthrough-substeps">
            {view.subSteps.map((item) => (
              <li key={item.label} className={`flex items-center gap-2 text-[13px] ${item.state === "current" ? "font-semibold text-ink" : item.state === "done" ? "text-muted" : "text-muted"}`} aria-current={item.state === "current" ? "step" : undefined}>
                <span aria-hidden className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[10px] ${item.state === "done" ? "border-green bg-green text-white" : item.state === "current" ? "border-blue text-blue" : "border-line"}`}>
                  {item.state === "done" ? <Check className="h-3 w-3" /> : item.state === "current" ? "•" : ""}
                </span>
                {item.label}
                <span className="sr-only">{item.state === "done" ? " (done)" : item.state === "current" ? " (now)" : " (later)"}</span>
              </li>
            ))}
          </ol>
        ) : null}
        <p id="walkthrough-instruction" className="text-[14px] leading-6 text-ink">{objective.instruction}</p>
        <div className="mt-4 rounded-xl border border-[#d6defe] bg-blue-weak px-4 py-3">
          <div className="text-[12px] font-semibold text-blue-ink">What to notice</div>
          <p className="mt-1 text-[13px] leading-5 text-ink-2">{objective.notice}</p>
        </div>
        {displayedObjectiveId === view.currentObjectiveId && view.terminalOutcome ? <p className="mt-4 rounded-xl border border-line bg-surface-muted px-4 py-3 text-[13px] text-ink">{view.terminalOutcome}</p> : null}
        {displayedObjectiveId === view.currentObjectiveId && view.currentAction && view.currentAction.type !== "merchant" ? <p className="mt-4 text-[12px] font-medium text-ink-2" data-testid="walkthrough-consequence">{view.currentAction.consequence}</p> : null}

        {displayedObjectiveId === view.currentObjectiveId && view.finish ? (
          <section className="mt-5 rounded-xl border border-line bg-surface-muted p-4" data-testid="walkthrough-finish" aria-labelledby="walkthrough-finish-title">
            <h3 id="walkthrough-finish-title" className="text-[15px] font-semibold text-ink">{view.finish.title}</h3>
            <ul className="mt-2 space-y-1.5 text-[13px] leading-5 text-ink-2">
              {view.finish.lines.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <Link href="/deals" className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-line-strong bg-surface px-3.5 text-[13px] font-semibold text-ink hover:bg-surface-muted" data-testid="walkthrough-try-another">Try another case</Link>
          </section>
        ) : yourTurn ? (
          <div className="mt-5 rounded-xl border border-[#cfd9ff] bg-surface p-4" data-testid="walkthrough-your-turn">
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-blue">{yourTurn.who === "buyer" ? "Play the buyer" : "Your turn"}</div>
            <p className="mt-1 text-[14px] leading-6 text-ink">
              Click <strong className="font-semibold">{yourTurn.label ? `“${yourTurn.label}”` : "the highlighted button"}</strong>
              {yourTurn.who === "buyer" ? " on the buyer's page." : "."}
            </p>
            {onShowMe ? (
              <button type="button" onClick={onShowMe} className="mt-2 text-[13px] font-semibold text-blue underline underline-offset-2 hover:text-blue-ink" data-walkthrough-show="true">
                Show me
              </button>
            ) : null}
          </div>
        ) : (
          primaryControl ??
          (primaryLabel ? (
            <Button variant={primaryTone === "simulate" ? "sim" : "secondary"} className="mt-5 w-full" onClick={onPrimary} disabled={primaryDisabled} data-walkthrough-primary="true">
              {primaryLabel}
            </Button>
          ) : null)
        )}
        {error ? <p role="alert" className="mt-2 text-[12px] text-red">{error}</p> : null}

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
        {backHref ? <Link href={backHref} className="mt-3 block text-center text-[12px] font-semibold text-blue hover:underline" data-testid="back-to-merchant">Back to merchant view</Link> : null}
      </div>
    </div>
  );
}
