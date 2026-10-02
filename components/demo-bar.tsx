"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import type { DemoStep } from "@/lib/demo-steps";
import { Button, ErrorText, useAction } from "./client";

const KEY = "adaptive-deals.demo-bar";
const EVT = "adaptive-deals:demo-bar";

// Per-browser visibility, read without an effect (server snapshot: visible).
function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}
function readHidden() {
  try {
    return localStorage.getItem(KEY) === "hidden";
  } catch {
    return false;
  }
}
const TYPE_LABEL: Record<DemoStep["type"], string> = { merchant: "Merchant action", buyer: "Buyer action", system: "Simulated event" };

/**
 * Demo controls (spec §8.1). Outside the merchant and buyer product frames, clearly labelled, and
 * never required: merchant and buyer decisions happen in the product, the bar only navigates to
 * them. It executes only labelled system events and simulated buyer replies.
 */
export function DemoBar({
  step,
  reply,
  simulatedDate,
  backHref,
}: {
  step: DemoStep | null;
  reply: { inReplyTo: string; label: string; scripts: { id: string; text: string }[] } | null;
  simulatedDate: string | null;
  backHref?: string;
}) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const hidden = useSyncExternalStore(subscribe, readHidden, () => false);
  const [choice, setChoice] = useState("");
  const [typed, setTyped] = useState("");
  const persist = (h: boolean) => {
    try {
      localStorage.setItem(KEY, h ? "hidden" : "visible");
    } catch {
      /* storage unavailable */
    }
    window.dispatchEvent(new Event(EVT));
  };
  const scriptId = choice || reply?.scripts[0]?.id || "";

  if (hidden)
    return (
      <button type="button" onClick={() => persist(false)} className="fixed bottom-3 left-3 z-40 rounded-full bg-[#2a2140] px-3 py-1.5 text-[12px] font-semibold text-white shadow-lg" data-testid="show-demo-controls">
        Show demo controls
      </button>
    );

  return (
    <div className="bg-[#2a2140] text-white" data-testid="demo-bar" role="region" aria-label="Demo controls (simulated, not part of the product)">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 text-[12px] sm:px-6">
        <span className="rounded bg-white/15 px-1.5 py-0.5 font-semibold uppercase tracking-wide">Demo controls · simulated</span>
        {simulatedDate ? (
          <span className="text-white/80" data-testid="demo-date">
            Simulated date: {simulatedDate}
          </span>
        ) : null}
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2" data-testid="demo-step">
          {step ? (
            <>
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-white/80">{TYPE_LABEL[step.type]}</span>
              {step.systemAction ? (
                <button
                  type="button"
                  disabled={pending}
                  className="rounded-md bg-white px-2.5 py-1 font-semibold text-[#2a2140] disabled:opacity-60"
                  data-testid="demo-next"
                  onClick={() => run({ action: "demo_system_step", stepId: step.systemAction })}
                >
                  {pending ? "Working…" : step.label}
                </button>
              ) : step.usesReplyControl ? (
                <span className="font-medium">{step.label}</span>
              ) : (
                <>
                  <span className="font-medium">{step.label}</span>
                  <Link href={step.href} className="font-semibold underline underline-offset-2" data-testid="demo-next-link">
                    {step.type === "buyer" ? "Open buyer page" : "Go there"}
                  </Link>
                </>
              )}
            </>
          ) : (
            <span className="text-white/80">Storyboard complete. Reset to run it again.</span>
          )}
        </span>
        {backHref ? (
          <Link href={backHref} className="font-semibold underline underline-offset-2" data-testid="back-to-merchant">
            Back to merchant view
          </Link>
        ) : null}
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-md border border-white/30 px-2 py-1 font-semibold [&::-webkit-details-marker]:hidden" data-testid="demo-menu">
            More
          </summary>
          <div className="absolute right-0 z-50 mt-1 w-52 space-y-1 rounded-lg bg-white p-2 text-[13px] text-ink shadow-xl">
            <button
              type="button"
              className="block w-full rounded px-2 py-1.5 text-left hover:bg-surface-muted"
              data-testid="demo-reset"
              onClick={() => {
                if (window.confirm("Reset the demo to the seeded synthetic state?")) run({ action: "reset" }, () => router.push("/deals/hero"));
              }}
            >
              Reset demo
            </button>
            <Link href="/presenter" className="block rounded px-2 py-1.5 hover:bg-surface-muted" data-testid="demo-presenter">
              Open presenter page
            </Link>
            <button type="button" className="block w-full rounded px-2 py-1.5 text-left hover:bg-surface-muted" data-testid="hide-demo-controls" onClick={() => persist(true)}>
              Hide demo controls
            </button>
          </div>
        </details>
      </div>
      {reply ? (
        <form
          className="mx-auto flex max-w-[1200px] flex-wrap items-end gap-2 border-t border-white/15 px-3 py-2 text-[12px] sm:px-6"
          data-testid="demo-reply"
          onSubmit={(e) => {
            e.preventDefault();
            const body = choice === "__typed" ? { action: "buyer_reply", inReplyTo: reply.inReplyTo, text: typed } : { action: "buyer_reply", inReplyTo: reply.inReplyTo, scriptId };
            run(body, () => {
              setTyped("");
              setChoice("");
            });
          }}
        >
          <span className="font-semibold">Simulated buyer reply</span>
          <span className="max-w-[320px] truncate text-white/70" title={reply.label}>
            to “{reply.label}”
          </span>
          <label className="sr-only" htmlFor="demo-reply-choice">
            Reply
          </label>
          <select id="demo-reply-choice" className="rounded-md bg-white px-2 py-1 text-[12px] text-ink" value={choice || scriptId} onChange={(e) => setChoice(e.target.value)} data-testid="demo-reply-choice">
            {reply.scripts.map((r) => (
              <option key={r.id} value={r.id}>
                “{r.text}”
              </option>
            ))}
            <option value="__typed">Type a reply…</option>
          </select>
          {choice === "__typed" ? (
            <input aria-label="Typed buyer reply" className="min-w-[200px] flex-1 rounded-md bg-white px-2 py-1 text-[12px] text-ink" value={typed} maxLength={500} onChange={(e) => setTyped(e.target.value)} data-testid="demo-reply-text" />
          ) : null}
          <Button type="submit" variant="secondary" className="min-h-0 py-1 text-[12px]" disabled={pending || (choice === "__typed" && !typed.trim())} data-testid="demo-reply-send">
            Send as buyer
          </Button>
          <span className="w-full text-white/60">Read by the same code rules as any reply. No AI reads it.</span>
        </form>
      ) : null}
      {error ? (
        <div className="mx-auto max-w-[1200px] px-3 pb-2 sm:px-6">
          <ErrorText error={error} />
        </div>
      ) : null}
    </div>
  );
}
