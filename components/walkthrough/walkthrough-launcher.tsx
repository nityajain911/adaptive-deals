"use client";

import { useMemo, useSyncExternalStore } from "react";
import { Compass } from "lucide-react";
import { notifyWalkthroughPreferences, readWalkthroughPreferences, subscribeWalkthroughPreferences, walkthroughPreferencesSnapshot, writeWalkthroughPreferences } from "./preferences";

export function WalkthroughLauncher() {
  const raw = useSyncExternalStore(subscribeWalkthroughPreferences, walkthroughPreferencesSnapshot, () => "");
  const preferences = useMemo(() => readWalkthroughPreferences({ getItem: () => raw || null }), [raw]);
  return (
    <button
      type="button"
      className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-white/25 px-2.5 text-[12px] font-semibold text-white/90 hover:bg-white/10"
      data-testid="walkthrough-launcher"
      onClick={() => {
        writeWalkthroughPreferences(window.localStorage, { ...preferences, dismissedWelcome: true, open: true });
        notifyWalkthroughPreferences();
      }}
    >
      <Compass aria-hidden className="h-3.5 w-3.5" /> Walkthrough
    </button>
  );
}
