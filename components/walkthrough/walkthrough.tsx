"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { WalkthroughView } from "@/lib/walkthrough";
import { useAction } from "@/components/client";
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

export function Walkthrough({ view, backHref }: { view: WalkthroughView; reply: { inReplyTo: string; label: string; scripts: { id: string; text: string }[] } | null; backHref?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { run, pending } = useAction();
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
    focusTarget(displayed.anchorId);
  };
  const displayedIndex = view.objectives.findIndex((item) => item.id === displayedId);
  const currentIndex = view.objectives.findIndex((item) => item.id === view.currentObjectiveId);

  return (
    <aside className="walkthrough-shell fixed inset-x-0 bottom-0 z-40 max-h-[62dvh] overflow-hidden border-t border-line bg-surface shadow-[0_-10px_35px_rgba(16,24,40,0.16)] md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[360px] md:border-l md:border-t-0" role="region" aria-label="Buildathon product walkthrough" data-open="true" data-testid="walkthrough">
      <WalkthroughProgress
        view={view}
        displayedObjectiveId={displayedId}
        primaryLabel={offRoute ? "Take me there" : "Complete this in the product"}
        primaryDisabled={pending}
        onPrimary={primary}
        onBack={() => update({ ...preferences, reviewingObjectiveId: view.objectives[Math.max(0, displayedIndex - 1)]?.id ?? null })}
        onNext={() => update({ ...preferences, reviewingObjectiveId: displayedIndex + 1 >= currentIndex ? null : view.objectives[displayedIndex + 1]?.id ?? null })}
        onHide={() => update({ ...preferences, open: false })}
        onRestart={() => {
          if (!window.confirm("Restart the walkthrough and remove unfinished demo progress for this case?")) return;
          run({ action: "reset" }, () => {
            update({ ...preferences, reviewingObjectiveId: null, open: true });
            router.push("/deals");
          });
        }}
        backHref={backHref}
      />
    </aside>
  );
}
