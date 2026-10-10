"use client";

import { useId, useState, type ReactNode } from "react";
import { cx } from "@/components/ui";

type Tab = "controls" | "evidence";

/** Keeps presenter-only controls separate from the material used to substantiate the demo. */
export function PresenterTabs({ controls, evidence }: { controls: ReactNode; evidence: ReactNode }) {
  const [active, setActive] = useState<Tab>("controls");
  const id = useId();
  const controlsId = `${id}-controls`;
  const evidenceId = `${id}-evidence`;
  const tabId = (tab: Tab) => `${id}-${tab}-tab`;
  const panelId = (tab: Tab) => tab === "controls" ? controlsId : evidenceId;
  const label = (tab: Tab) => tab === "controls" ? "Demo controls" : "Evidence and integrity";

  return (
    <div>
      <div role="tablist" aria-label="Presenter sections" className="mb-5 flex w-fit rounded-xl border border-line bg-surface-muted p-1">
        {(["controls", "evidence"] as const).map((tab) => (
          <button
            key={tab}
            id={tabId(tab)}
            type="button"
            role="tab"
            aria-selected={active === tab}
            aria-controls={panelId(tab)}
            onClick={() => setActive(tab)}
            className={cx("min-h-10 rounded-lg px-3.5 text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue", active === tab ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink")}
          >
            {label(tab)}
          </button>
        ))}
      </div>
      <section id={controlsId} role="tabpanel" aria-labelledby={tabId("controls")} hidden={active !== "controls"} data-testid="presenter-demo-controls">
        {controls}
      </section>
      <section id={evidenceId} role="tabpanel" aria-labelledby={tabId("evidence")} hidden={active !== "evidence"} data-testid="presenter-evidence">
        {evidence}
      </section>
    </div>
  );
}
