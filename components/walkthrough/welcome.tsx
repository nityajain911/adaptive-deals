"use client";

import { useMemo, useSyncExternalStore } from "react";
import { ArrowRight, Compass } from "lucide-react";
import { Button } from "@/components/client";
import { Card } from "@/components/ui";
import { notifyWalkthroughPreferences, readWalkthroughPreferences, subscribeWalkthroughPreferences, type WalkthroughPreferences, walkthroughPreferencesSnapshot, writeWalkthroughPreferences } from "./preferences";

export function WalkthroughWelcome() {
  const raw = useSyncExternalStore(subscribeWalkthroughPreferences, walkthroughPreferencesSnapshot, () => "");
  const preferences = useMemo(() => readWalkthroughPreferences({ getItem: () => raw || null }), [raw]);

  const update = (next: WalkthroughPreferences) => {
    writeWalkthroughPreferences(window.localStorage, next);
    notifyWalkthroughPreferences();
  };

  if (preferences.dismissedWelcome) return null;

  return (
    <Card className="mb-6 border-[#cfd9ff] bg-[#f6f8ff] p-5" data-testid="walkthrough-welcome">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-[760px]">
          <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-blue"><Compass aria-hidden className="h-4 w-4" /> Buildathon walkthrough</div>
          <h2 className="mt-2 text-[18px] font-semibold text-ink">See how Adaptive Deals turns buyer constraints into executable terms</h2>
          <p className="mt-1 text-[13px] leading-5 text-ink-2">Follow a guided product walkthrough. You will make the merchant decisions; buyer and system events are clearly simulated.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => update({ version: preferences.version, dismissedWelcome: true, open: false, reviewingObjectiveId: null })}
            data-testid="explore-without-walkthrough"
          >
            Explore on my own
          </Button>
          <Button
            variant="primary"
            onClick={() => update({ version: preferences.version, dismissedWelcome: true, open: true, reviewingObjectiveId: null })}
            data-testid="start-walkthrough"
          >
            Start walkthrough <ArrowRight aria-hidden className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
