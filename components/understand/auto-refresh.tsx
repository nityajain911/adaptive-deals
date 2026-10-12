"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** While a reply is awaited, look for it every few seconds (only while the page is in view), so it arrives without a manual reload. */
export function AutoRefresh({ everyMs = 3000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") router.refresh(); };
    const timer = window.setInterval(tick, everyMs);
    return () => window.clearInterval(timer);
  }, [router, everyMs]);
  return null;
}
