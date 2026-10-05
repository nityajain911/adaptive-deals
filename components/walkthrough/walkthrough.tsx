"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { WalkthroughView } from "@/lib/walkthrough";
import { confirmedRestartCommand, walkthroughCommand, type WalkthroughCommand } from "@/lib/walkthrough-actions";
import { Button, useAction } from "@/components/client";
import { notifyWalkthroughPreferences, readWalkthroughPreferences, subscribeWalkthroughPreferences, walkthroughPreferencesSnapshot, writeWalkthroughPreferences } from "./preferences";
import { WalkthroughProgress } from "./walkthrough-progress";

const PENDING_ANCHOR_KEY = "adaptive-deals.walkthrough.pending-anchor";

function focusTarget(anchorId: string) {
  const target = document.querySelector<HTMLElement>(`[data-walkthrough="${anchorId}"]`);
  if (!target) return false;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  target.focus({ preventScroll: true });
  return true;
}

function BuyerReplyControl({ reply, pending, error, send }: { reply: { inReplyTo: string; label: string; scripts: { id: string; text: string }[] }; pending: boolean; error: string | null; send: (command: WalkthroughCommand) => void }) {
  const [choice, setChoice] = useState(reply.scripts[0]?.id ?? "__typed");
  const [typed, setTyped] = useState("");
  const custom = choice === "__typed";
  return (
    <form
      className="mt-4 space-y-2 rounded-xl border border-[#ddd5ff] bg-violet-weak p-3"
      onSubmit={(event) => {
        event.preventDefault();
        send(walkthroughCommand(custom ? { action: "buyer_reply", inReplyTo: reply.inReplyTo, text: typed } : { action: "buyer_reply", inReplyTo: reply.inReplyTo, scriptId: choice }));
      }}
    >
      <label className="block text-[12px] font-semibold text-ink">Simulated buyer response
        <select className="mt-1 block w-full rounded-lg border border-line-strong bg-surface px-2 py-2 text-[12px] font-normal" value={choice} onChange={(event) => setChoice(event.target.value)} data-testid="walkthrough-reply-choice">
          {reply.scripts.map((script) => <option key={script.id} value={script.id}>{script.text}</option>)}
          <option value="__typed">Type another reply</option>
        </select>
      </label>
      {custom ? <textarea aria-label="Another simulated buyer reply" className="min-h-20 w-full rounded-lg border border-line-strong bg-surface px-2 py-2 text-[12px]" value={typed} maxLength={500} onChange={(event) => setTyped(event.target.value)} /> : null}
      <p className="text-[11px] text-ink-2">Sends the selected text as the demo buyer replying to “{reply.label}”.</p>
      <Button type="submit" variant="sim" className="w-full" disabled={pending || (custom && !typed.trim())} data-walkthrough-primary="true">{pending ? "Sending…" : "Send simulated buyer response"}</Button>
      {error ? <p role="alert" className="text-[12px] text-red">{error}</p> : null}
    </form>
  );
}

export function Walkthrough({ view, reply, backHref }: { view: WalkthroughView; reply: { inReplyTo: string; label: string; scripts: { id: string; text: string }[] } | null; backHref?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { run, pending, error } = useAction();
  const raw = useSyncExternalStore(subscribeWalkthroughPreferences, walkthroughPreferencesSnapshot, () => "");
  const preferences = useMemo(() => readWalkthroughPreferences({ getItem: () => raw || null }), [raw]);
  const wasOpen = useRef(false);
  const displayedId = view.objectives.some((item) => item.id === preferences.reviewingObjectiveId) ? preferences.reviewingObjectiveId! : view.currentObjectiveId;
  const displayed = view.objectives.find((item) => item.id === displayedId) ?? view.objectives[0];
  const current = displayedId === view.currentObjectiveId;
  const destination = current ? (view.currentAction?.href ?? displayed.href) : displayed.href;
  const offRoute = pathname !== destination;

  const update = (next: typeof preferences) => {
    writeWalkthroughPreferences(window.localStorage, next);
    notifyWalkthroughPreferences();
  };

  useEffect(() => {
    if (preferences.open && !wasOpen.current) document.getElementById("walkthrough-heading")?.focus();
    wasOpen.current = preferences.open;
  }, [preferences.open]);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-walkthrough-open", preferences.open);
    return () => document.documentElement.removeAttribute("data-walkthrough-open");
  }, [preferences.open]);

  useEffect(() => {
    if (!preferences.open) return;
    const target = document.querySelector<HTMLElement>(`[data-walkthrough="${displayed.anchorId}"]`);
    if (!target) return;
    const describedBy = target.getAttribute("aria-describedby");
    target.setAttribute("data-walkthrough-active", "true");
    target.setAttribute("aria-describedby", [describedBy, "walkthrough-instruction"].filter(Boolean).join(" "));
    return () => {
      target.removeAttribute("data-walkthrough-active");
      if (describedBy) target.setAttribute("aria-describedby", describedBy);
      else target.removeAttribute("aria-describedby");
    };
  }, [displayed.anchorId, pathname, preferences.open]);

  useEffect(() => {
    if (!preferences.open) return;
    const pendingAnchor = window.sessionStorage.getItem(PENDING_ANCHOR_KEY);
    if (!pendingAnchor || pendingAnchor !== displayed.anchorId) return;
    const timer = window.setTimeout(() => {
      if (focusTarget(pendingAnchor)) window.sessionStorage.removeItem(PENDING_ANCHOR_KEY);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [displayed.anchorId, pathname, preferences.open]);

  if (!preferences.open) return null;

  const primary = () => {
    if (offRoute) {
      window.sessionStorage.setItem(PENDING_ANCHOR_KEY, displayed.anchorId);
      router.push(destination);
      return;
    }
    if (current && view.currentAction?.systemAction) {
      run(walkthroughCommand({ action: "demo_system_step", stepId: view.currentAction.systemAction }));
      return;
    }
    focusTarget(displayed.anchorId);
  };
  const displayedIndex = view.objectives.findIndex((item) => item.id === displayedId);
  const currentIndex = view.objectives.findIndex((item) => item.id === view.currentObjectiveId);

  return (
    <aside className="walkthrough-shell fixed inset-x-0 bottom-0 z-40 max-h-[62dvh] overflow-hidden border-t border-line bg-surface shadow-[0_-10px_35px_rgba(16,24,40,0.16)] md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[360px] md:border-l md:border-t-0" role="region" aria-label="Buildathon product walkthrough" data-open="true" data-testid="walkthrough">
      <WalkthroughProgress
        view={view}
        displayedObjectiveId={displayedId}
        primaryLabel={offRoute ? "Take me there" : view.currentAction?.systemAction ? view.currentAction.label : "Complete this in the product"}
        primaryDisabled={pending}
        onPrimary={primary}
        onBack={() => update({ ...preferences, reviewingObjectiveId: view.objectives[Math.max(0, displayedIndex - 1)]?.id ?? null })}
        onNext={() => update({ ...preferences, reviewingObjectiveId: displayedIndex + 1 >= currentIndex ? null : view.objectives[displayedIndex + 1]?.id ?? null })}
        onHide={() => update({ ...preferences, open: false })}
        onRestart={() => {
          const command = confirmedRestartCommand(window.confirm("Restart the walkthrough and remove unfinished demo progress for this case?"));
          if (!command) return;
          run(walkthroughCommand(command), () => {
            update({ ...preferences, reviewingObjectiveId: null, open: true });
            router.push("/deals");
          });
        }}
        primaryControl={!offRoute && current && view.currentAction?.usesReplyControl && reply ? <BuyerReplyControl key={reply.inReplyTo} reply={reply} pending={pending} error={error} send={(command) => run(walkthroughCommand(command))} /> : undefined}
        error={!(!offRoute && current && view.currentAction?.usesReplyControl && reply) ? error : null}
        backHref={backHref}
      />
    </aside>
  );
}
