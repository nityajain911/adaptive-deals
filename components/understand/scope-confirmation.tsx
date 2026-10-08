import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import type { ModelProvenance } from "@/lib/model-provenance";

type Extraction = Pick<ModelProvenance, "modelMade" | "providerName">;

const quoted = (phrases: string[]) => phrases.map((p) => `“${p}”`).join(" and ");

/**
 * Shown on Understand when the buyer asked for something that matched no service ("the complete package").
 * Code rejected the phrase; the merchant, not the model, decides which services the buyer means. Who
 * extracted the phrase is a reviewer detail and lives in the audit trail.
 */
export function ScopeConfirmationCard({ phrases, form }: { phrases: { rawText: string; evidenceQuote: string }[]; extraction?: Extraction; form: ReactNode }) {
  return (
    <Card className="p-5" data-testid="scope-card" data-walkthrough="scope-confirmation">
      <h2 className="text-[16px] font-semibold text-ink">Which services do they need?</h2>
      <p className="mt-2 text-[14px] font-medium text-ink" data-testid="scope-message">
        They asked for {quoted(phrases.map((p) => p.rawText))} but did not say which services that means.
      </p>
      <p className="mt-2 text-[13px] text-ink-2" data-testid="scope-attribution">Tick the services they need. We will work out the offers from your answer.</p>
      {form}
    </Card>
  );
}

/** The settled record of a confirmation. */
export function ConfirmedServices({ names, phrases }: { names: string[]; phrases: string[]; extraction?: Extraction }) {
  return (
    <div className="text-[13px] text-ink-2" data-testid="scope-confirmed">
      <p>
        <span className="font-semibold text-ink">You confirmed they need: {names.join(", ")}</span> · from {quoted(phrases)}
      </p>
    </div>
  );
}
