"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Presentation } from "lucide-react";

/** The presenter frame's floating button and panel. It closes on Escape, on a click outside, and after any action inside, so it never covers the product. */
export function FrameShell({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = () => { if (ref.current?.open) ref.current.open = false; };
    const outside = (event: PointerEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) close(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  return (
    <details ref={ref} className="group fixed bottom-20 left-3 z-50 md:bottom-5 md:left-5" data-testid="presenter-frame">
      <summary
        className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full border border-white/20 bg-[#0b1b3f] px-4 text-[14px] font-semibold text-white shadow-lg hover:bg-[#12285a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3d6bff]"
        data-testid="presenter-frame-toggle"
        aria-label="Presenter tools"
      >
        <Presentation aria-hidden className="h-4 w-4" /> Presenter
      </summary>
      <div
        className="absolute bottom-14 left-0 w-[min(20rem,calc(100vw-1.5rem))] space-y-3 rounded-2xl border border-white/15 bg-[#0b1b3f] p-4 text-white shadow-[0_12px_40px_rgba(2,8,23,0.45)]"
        data-testid="presenter-hub"
        onClick={(event) => { if ((event.target as HTMLElement).closest("a, button")) window.setTimeout(() => { if (ref.current) ref.current.open = false; }, 0); }}
      >
        {children}
      </div>
    </details>
  );
}
