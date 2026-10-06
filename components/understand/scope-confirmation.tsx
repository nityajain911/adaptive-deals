import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import type { ModelProvenance } from "@/lib/model-provenance";
import { scopeAttribution } from "@/lib/scope-confirmation";

type Extraction = Pick<ModelProvenance, "modelMade" | "providerName">;

const quoted = (phrases: string[]) => phrases.map((p) => `“${p}”`).join(" and ");

/**
 * Shown on Understand when the extraction named required services that matched no package. Code
 * rejected the phrase; the merchant, not the model, decides which services the buyer requires.
 */
export function ScopeConfirmationCard({ phrases, extraction, form }: { phrases: { rawText: string; evidenceQuote: string }[]; extraction: Extraction; form: ReactNode }) {
  const who = extraction.modelMade ? `${extraction.providerName} extracted the phrase` : "Phrase from the hand-written sample extraction";
  return (
    <Card className="p-5" data-testid="scope-card" data-walkthrough="scope-confirmation">
      <h2 className="text-[16px] font-semibold text-ink">Confirm required services</h2>
      <p className="mt-2 text-[14px] font-medium text-ink" data-testid="scope-message">
        We couldn&apos;t map {quoted(phrases.map((p) => p.rawText))} to specific services.
      </p>
      <ul className="mt-2 space-y-1 text-[13px] text-ink-2">
        {phrases.map((p) => (
          <li key={p.rawText}>
            Buyer wrote: <span className="font-medium text-ink">“{p.evidenceQuote}”</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-muted" data-testid="scope-attribution">
        {who} · code could not map it to a service · you confirm the services.
      </p>
      <p className="mt-2 text-[13px] text-ink-2">Choose the services the buyer requires. Your confirmation is recorded as yours, and the engine recalculates the options from it.</p>
      {form}
    </Card>
  );
}

/** The settled record of a confirmation, with each party credited for exactly its part. */
export function ConfirmedServices({ names, phrases, extraction }: { names: string[]; phrases: string[]; extraction: Extraction }) {
  return (
    <div className="text-[13px] text-ink-2" data-testid="scope-confirmed">
      <p>
        <span className="font-semibold text-ink">Required services confirmed by you: {names.join(", ")}</span> · from {quoted(phrases)}
      </p>
      <p className="mt-1 text-[12px] text-muted">{scopeAttribution(extraction)}</p>
    </div>
  );
}
