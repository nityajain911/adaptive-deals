import Link from "next/link";
import { ChevronLeft, ChevronRight, EyeOff, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import type { WalkthroughActor, WalkthroughView } from "@/lib/walkthrough";
import { Button } from "@/components/client";

/** What actually produced this step, in plain words. Each line says only what is true of that actor. */
const UNDER_THE_HOOD: Record<WalkthroughActor, string> = {
  merchant: "You decide. Nothing is sent or saved until you approve the exact terms.",
  buyer: "A simulated buyer. The reply is scripted or typed by you; no real person or message is involved.",
  system: "A simulated payment system. No real payment, mandate or WhatsApp message is sent.",
  ai: "A model proposed this, as words and quotes only. Code kept only what it found in the buyer's own messages and calculated every amount.",
  sample: "A hand-written sample standing in for model output. No model was called.",
  engine: "Code only. The rules engine checks every offer against your prices, costs and limits; no model decides money.",
};

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
  const index = view.objectives.findIndex((item) => item.id === objective.id);
  const currentIndex = view.objectives.findIndex((item) => item.id === view.currentObjectiveId);
  const core = view.objectives.filter((item) => !item.optional);
  const coreIndex = core.findIndex((item) => item.id === objective.id);
  const displayedStepLabel = objective.optional ? "Optional exploration" : `Step ${coreIndex + 1} of ${core.length}`;

  const nextStep = (children: ReactNode, sub: string) => (
    <>
      <span className="block text-[17px] font-bold leading-6">{children}</span>
      <span className="block text-[12px] font-medium leading-4 opacity-90">{sub}</span>
    </>
  );
  const bigButton = "mt-5 min-h-16 w-full flex-col justify-center rounded-xl px-4 text-center";

  return (
    <div className="flex h-full flex-col bg-[#0b1b3f] text-white">
      <div className="border-b border-white/15 px-5 py-4">
        <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#9db4ff]">GUIDE · {displayedStepLabel.toUpperCase()}</div>
        <h2 id="walkthrough-heading" tabIndex={-1} className="mt-2 text-[20px] font-bold tracking-tight text-white">{objective.title}</h2>
        <p className="mt-2 text-[14px] leading-5 text-slate-300">{objective.notice}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <p id="walkthrough-instruction" className="text-[14px] leading-6 text-slate-100">{objective.instruction}</p>
        {displayedObjectiveId === view.currentObjectiveId && view.terminalOutcome ? <p className="mt-4 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-[13px] text-white">{view.terminalOutcome}</p> : null}
        {displayedObjectiveId === view.currentObjectiveId && view.currentAction && view.currentAction.type !== "merchant" ? <p className="mt-4 text-[12px] font-medium text-slate-300" data-testid="walkthrough-consequence">{view.currentAction.consequence}</p> : null}

        {displayedObjectiveId === view.currentObjectiveId && view.finish ? (
          <section className="mt-5 rounded-xl border border-line bg-surface p-4 text-ink" data-testid="walkthrough-finish" aria-labelledby="walkthrough-finish-title">
            <h3 id="walkthrough-finish-title" className="text-[15px] font-semibold text-ink">{view.finish.title}</h3>
            <ul className="mt-2 space-y-1.5 text-[13px] leading-5 text-ink-2">
              {view.finish.lines.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <Link href="/deals" className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-line-strong bg-surface px-3.5 text-[13px] font-semibold text-ink hover:bg-surface-muted" data-testid="walkthrough-try-another">Try another case</Link>
          </section>
        ) : yourTurn ? (
          <>
            <div className="mt-5 rounded-xl border border-[#cfd9ff] bg-surface p-4 text-ink" data-testid="walkthrough-your-turn">
              <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-blue">{yourTurn.who === "buyer" ? "Play the buyer" : "Your turn"}</div>
              <p className="mt-1 text-[14px] leading-6 text-ink">
                Click <strong className="font-semibold">{yourTurn.label ? `“${yourTurn.label}”` : "the highlighted button"}</strong>
                {yourTurn.who === "buyer" ? " on the buyer's page." : "."} The guide never clicks it for you.
              </p>
            </div>
            {onShowMe ? (
              <Button variant="primary" className={bigButton} onClick={onShowMe} data-walkthrough-show="true">
                {nextStep("Next step", "Show me where to click")}
              </Button>
            ) : null}
          </>
        ) : (
          primaryControl ? <div className="mt-4 rounded-xl bg-surface p-0.5 text-ink">{primaryControl}</div> :
          (primaryLabel ? (
            <Button variant={primaryTone === "simulate" ? "sim" : "primary"} className={bigButton} onClick={onPrimary} disabled={primaryDisabled} data-walkthrough-primary="true">
              {nextStep("Next step", primaryLabel)}
            </Button>
          ) : null)
        )}
        {error ? <p role="alert" className="mt-2 text-[12px] text-[#ffb4a8]">{error}</p> : null}

        <details className="mt-5 border-t border-white/15 pt-3" data-testid="walkthrough-under-the-hood">
          <summary className="cursor-pointer text-[13px] font-semibold text-white">Under the hood</summary>
          <p className="mt-2 text-[12px] leading-5 text-slate-300">{UNDER_THE_HOOD[objective.actor]}</p>
          <p className="mt-2 text-[12px] leading-5 text-slate-400" data-testid="walkthrough-provenance">
            {ACTOR_LABEL[objective.actor]}{displayedObjectiveId === view.currentObjectiveId && view.provenanceLabel ? ` · ${view.provenanceLabel}` : ""}
          </p>
        </details>
      </div>

      <div className="border-t border-white/15 px-4 py-3 text-[12px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="inline-flex items-center gap-1 font-semibold text-slate-300 underline-offset-2 hover:text-white hover:underline disabled:opacity-40 disabled:no-underline" onClick={onBack} disabled={index <= 0}><ChevronLeft aria-hidden className="h-3.5 w-3.5" /> Back</button>
          {index < currentIndex ? <button type="button" className="inline-flex items-center gap-1 font-semibold text-slate-300 underline-offset-2 hover:text-white hover:underline" onClick={onNext}>Forward <ChevronRight aria-hidden className="h-3.5 w-3.5" /></button> : null}
          <span className="ml-auto flex items-center gap-4">
            <button type="button" className="inline-flex items-center gap-1 font-semibold text-slate-300 underline-offset-2 hover:text-white hover:underline" onClick={onHide}><EyeOff aria-hidden className="h-3.5 w-3.5" /> Hide</button>
            <button type="button" className="inline-flex items-center gap-1 font-semibold text-slate-300 underline-offset-2 hover:text-white hover:underline" onClick={onRestart}><RotateCcw aria-hidden className="h-3.5 w-3.5" /> Restart</button>
          </span>
        </div>
        {backHref ? <Link href={backHref} className="mt-3 block text-center font-semibold text-[#9db4ff] hover:underline" data-testid="back-to-merchant">Back to merchant view</Link> : null}
      </div>
    </div>
  );
}
