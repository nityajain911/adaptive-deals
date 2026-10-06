"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "../ui";

/**
 * The message area of a chat: a fixed-height panel that scrolls inside itself, starting at the
 * latest message, so a long conversation never lengthens the page.
 */
export function ChatScroll({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [children]);
  return (
    <ol ref={ref} aria-label={label} tabIndex={0} data-testid="chat-scroll" className={cx("h-[52vh] max-h-[34rem] space-y-2 overflow-y-auto overscroll-contain bg-[#efeae2] p-4 lg:h-auto lg:max-h-[36rem]", className)}>
      {children}
    </ol>
  );
}
