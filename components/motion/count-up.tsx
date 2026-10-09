"use client";

import { useEffect, useRef, useState } from "react";
import { formatINR } from "@/domain/money";

/**
 * Counts a number up to its final value once, when it first appears. The server renders the final
 * text, so the page is correct without scripts and under reduced motion; the count is decoration only.
 */
/** `value` is in paise and is shown as whole rupees. */
export function CountUp({ value, durationMs = 700, ...rest }: { value: number; durationMs?: number } & Omit<React.HTMLAttributes<HTMLSpanElement>, "children">) {
  const [shown, setShown] = useState(value);
  const done = useRef(false);
  useEffect(() => {
    // Only the first appearance counts up; any later change to the value is shown at once and exactly.
    if (done.current || value <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    done.current = true;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    setShown(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);
  return <span {...rest}>{formatINR(Math.round(shown / 100) * 100)}</span>;
}
