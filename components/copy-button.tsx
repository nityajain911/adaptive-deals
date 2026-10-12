"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cx } from "./ui";

/**
 * A quiet copy control for an identifier or hash that the page does not print. The first characters sit in the
 * tooltip so a person can tell which one it is; the full value goes to the clipboard.
 */
export function CopyButton({ value, label, text = false, className }: { value: string; label: string; text?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); } catch { return; }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={`Copy ${label} (${value.slice(0, 8)}…)`}
      aria-label={`Copy ${label}`}
      data-testid="copy-button"
      className={cx("inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 align-middle text-[12px] font-medium text-muted hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue", className)}
    >
      {copied ? <Check aria-hidden className="h-3.5 w-3.5 text-green" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
      {text ? <span>{copied ? "Copied" : `Copy ${label}`}</span> : null}
      <span className="sr-only" role="status">{copied ? "Copied" : ""}</span>
    </button>
  );
}
