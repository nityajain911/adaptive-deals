"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { BusinessEconomics, EconomicsContent } from "@/domain/business-economics";
import type { EconomicsActivationPreview } from "@/lib/economics-activation";
import { Button } from "@/components/client";
import { ServicesTable } from "./services-table";
import { GuardrailsForm } from "./guardrails-form";
import { ReviewPanel } from "./review-panel";
import { WhatIfPanel } from "./what-if-panel";
import { CommercialMemoryPanel, type MemorySourceSummary } from "@/components/commercial-memory/commercial-memory-panel";

type Json = { ok: boolean; result?: unknown; error?: string };
async function action(body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json() as Json;
  if (!json.ok) throw new Error(json.error ?? "Action failed");
  return json.result;
}

const dateLabel = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

const editableContent = (economics: EconomicsContent): EconomicsContent => structuredClone({
  services: economics.services,
  guardrails: economics.guardrails,
  discountLadderBps: economics.discountLadderBps,
  fixed: economics.fixed,
});

type EconomicsEditorProps = {
  active: BusinessEconomics;
  initialLabel: string | null;
  illustrativeContent: EconomicsContent;
  memorySources: MemorySourceSummary[];
  children?: ReactNode;
};

export function EconomicsEditor({ active, initialLabel, illustrativeContent, memorySources, children }: EconomicsEditorProps) {
  const router = useRouter();
  const [content, setContent] = useState<EconomicsContent>(() => editableContent(active));
  const [version, setVersion] = useState(active.version);
  const [label, setLabel] = useState(initialLabel);
  const [activatedAt, setActivatedAt] = useState(active.activatedAt);
  const [ladderText, setLadderText] = useState(active.discountLadderBps.map((x) => x / 100).join(", "));
  const [preview, setPreview] = useState<EconomicsActivationPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(true);

  const contentForReview = (): EconomicsContent => ({
    ...content,
    discountLadderBps: ladderText.split(",").map((x) => x.trim()).filter(Boolean).map((x) => Math.round(Number(x) * 100)),
  });
  const run = async (fn: () => Promise<void>) => {
    setPending(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
    finally { setPending(false); }
  };

  return (
    <div className="space-y-4" data-testid="economics-page">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-ink sm:text-[32px]">Prices &amp; costs</h1>
        <p className="mt-1 max-w-2xl text-[14px] leading-6 text-ink-2">What you charge, what it costs you to deliver, and the lowest deal you&apos;ll accept.</p>
      </div>
      {children}
      <CommercialMemoryPanel sources={memorySources} onEditorVisibilityChange={setShowEditor} onApply={(next) => { setContent(next); setLadderText(next.discountLadderBps.map((x) => x / 100).join(", ")); setPreview(null); setError(null); }} />
      {showEditor ? <>
      <ServicesTable services={content.services} guardrails={content.guardrails} onChange={(services) => { setContent((old) => ({ ...old, services })); setPreview(null); }} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
        <GuardrailsForm guardrails={content.guardrails} ladderText={ladderText} onGuardrails={(guardrails) => { setContent((old) => ({ ...old, guardrails })); setPreview(null); }} onLadder={(value) => { setLadderText(value); setPreview(null); }} />
        <WhatIfPanel content={content} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" data-testid="economics-review-button" disabled={pending} onClick={() => void run(async () => { const draft = contentForReview(); await action({ action: "save_economics_draft", content: draft }); const result = await action({ action: "preview_economics_activation" }) as EconomicsActivationPreview; setPreview(result); })}>{pending ? "Checking…" : "Check my changes"}</Button>
        <span className="text-[13px] text-muted" data-testid="economics-current">Saved as version {version}. Nothing changes until you check and save.</span>
      </div>
      </> : <p className="rounded-xl border border-line bg-surface-muted px-4 py-3 text-[14px] text-ink-2" data-testid="economics-editor-hidden">Review the extracted values when you want to edit your prices, costs or rules.</p>}
      <details className="rounded-xl border border-line bg-surface-muted px-3 py-2" data-testid="demo-tools">
        <summary className="cursor-pointer text-[13px] font-semibold text-ink" data-testid="demo-tools-toggle">Demo tools</summary>
        <div className="mt-2 space-y-2 pb-1">
          <p className="text-[13px] text-muted" data-testid="economics-version">Version {version}{label ? ` · ${label}` : ""} · saved {dateLabel(activatedAt)}</p>
          <div className="flex flex-wrap gap-2">
            <Button data-testid="economics-illustrative-preset" disabled={pending} onClick={() => { const example = structuredClone(illustrativeContent); setContent(example); setLadderText(example.discountLadderBps.map((x) => x / 100).join(", ")); setPreview(null); setError(null); }}>Try an example that allows discounts (up to 10%)</Button>
            <Button data-testid="economics-restore" disabled={pending} onClick={() => { if (!window.confirm("Put the demo prices and costs back? This is saved as a new version.")) return; void run(async () => { const result = await action({ action: "restore_default_economics" }) as { version: number }; setVersion(result.version); setPreview(null); router.refresh(); window.location.reload(); }); }}>Put the demo prices back</Button>
          </div>
        </div>
      </details>
      {error && !preview ? <p role="alert" className="text-[13px] text-red">{error}</p> : null}
      {preview ? <ReviewPanel preview={preview} pending={pending} error={error} onActivate={() => void run(async () => { const result = await action({ action: "activate_economics" }) as { version: number; activatedAt: string; label: string | null }; setVersion(result.version); setActivatedAt(result.activatedAt); setLabel(result.label); setContent(contentForReview()); setPreview(null); router.refresh(); })} /> : null}
    </div>
  );
}
