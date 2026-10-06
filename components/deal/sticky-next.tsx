"use client";

import { useEffect, useState } from "react";
import { ArrowDown } from "lucide-react";
import { usePathname } from "next/navigation";

const SELECTOR = '[data-testid="primary-action"]';

/**
 * On a phone, a bar that points at the stage's one real action when it is off-screen. It appears
 * only when exactly one primary action is on the page, and tapping it scrolls to that button and
 * focuses it. It never performs the action, so nothing consequential can be sent from the bar.
 */
export function StickyNext({ label }: { label: string }) {
  const [seen, setSeen] = useState<{ el: HTMLElement; visible: boolean } | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const found = document.querySelectorAll<HTMLElement>(SELECTOR);
    if (found.length !== 1) return;
    const el = found[0];
    // The observer reports once on observe, so the first state is set from its callback.
    const observer = new IntersectionObserver(([entry]) => setSeen({ el, visible: entry.isIntersecting }), { threshold: 0.6 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [pathname, label]);

  if (!seen || seen.visible || !seen.el.isConnected) return null;
  const target = seen.el;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:hidden" data-testid="sticky-next">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue px-4 text-[15px] font-semibold text-white"
        onClick={() => {
          target.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
          target.focus({ preventScroll: true });
        }}
      >
        {label} <ArrowDown aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}
