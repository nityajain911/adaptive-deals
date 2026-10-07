"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { economicsContentHash, economicsContentOf, type BusinessEconomics, type EconomicsContent } from "@/domain/business-economics";
import type { EconomicsActivationPreview } from "@/lib/economics-activation";
import { Button } from "@/components/client";
import { illustrativeEconomicsContent, isIllustrativeHash } from "@/lib/economics-illustrative";
import { ServicesTable } from "./services-table";
import { GuardrailsForm } from "./guardrails-form";
import { ReviewPanel } from "./review-panel";

type Json = { ok: boolean; result?: unknown; error?: string };
async function action(body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json() as Json;
  if (!json.ok) throw new Error(json.error ?? "Action failed");
  return json.result;
}

const dateLabel = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

export function EconomicsEditor({ active, children }: { active: BusinessEconomics; children?: ReactNode }) {
  const router = useRouter();
  const [content, setContent] = useState<EconomicsContent>(() => economicsContentOf(active));
  const [version, setVersion] = useState(active.version);
  const [hash, setHash] = useState(active.hash);
  const [activatedAt, setActivatedAt] = useState(active.activatedAt);
  const [ladderText, setLadderText] = useState(active.discountLadderBps.map((x) => x / 100).join(", "));
  const [preview, setPreview] = useState<EconomicsActivationPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Adaptive Deals</div>
          <h1 className="mt-1 text-[26px] font-bold tracking-tight text-ink sm:text-[32px]">Business economics</h1>
          <p className="mt-1 text-[14px] leading-6 text-ink-2">Set the delivery costs and rules every recommended offer must respect.</p>
          <p className="mt-1 text-[13px] font-medium text-muted" data-testid="economics-version">Version {version}{isIllustrativeHash(hash) ? " · Illustrative" : ""} · activated {dateLabel(activatedAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
        <Button data-testid="economics-illustrative-preset" disabled={pending} onClick={() => { const example = illustrativeEconomicsContent(); setContent(example); setLadderText(example.discountLadderBps.map((x) => x / 100).join(", ")); setPreview(null); setError(null); }}>Load illustrative example: 10% maximum discount with 0%, 5%, 10% approved</Button>
        <Button data-testid="economics-restore" disabled={pending} onClick={() => { if (!window.confirm("Restore the demo business economics as a new version?")) return; void run(async () => { const result = await action({ action: "restore_default_economics" }) as { version: number }; setVersion(result.version); setPreview(null); router.refresh(); window.location.reload(); }); }}>Restore demo defaults</Button>
        </div>
      </div>
      {children}
      <ServicesTable services={content.services} onChange={(services) => { setContent((old) => ({ ...old, services })); setPreview(null); }} />
      <GuardrailsForm guardrails={content.guardrails} ladderText={ladderText} onGuardrails={(guardrails) => { setContent((old) => ({ ...old, guardrails })); setPreview(null); }} onLadder={(value) => { setLadderText(value); setPreview(null); }} />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" data-testid="economics-review-button" disabled={pending} onClick={() => void run(async () => { const draft = contentForReview(); await action({ action: "save_economics_draft", content: draft }); const result = await action({ action: "preview_economics_activation" }) as EconomicsActivationPreview; setPreview(result); })}>{pending ? "Reviewing…" : "Review changes"}</Button>
        <span className="text-[13px] text-muted">Nothing changes until you review and activate a new version.</span>
      </div>
      {error && !preview ? <p role="alert" className="text-[13px] text-red">{error}</p> : null}
      {preview ? <ReviewPanel preview={preview} nextVersion={version + 1} pending={pending} error={error} onActivate={() => void run(async () => { const result = await action({ action: "activate_economics" }) as { version: number }; setVersion(result.version); setActivatedAt(new Date().toISOString()); setContent(contentForReview()); setHash(economicsContentHash(contentForReview())); setPreview(null); router.refresh(); })} /> : null}
    </div>
  );
}
