"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { tokenizeJson, type JsonTokenKind } from "@/lib/json-tokens";

const COLOUR: Record<JsonTokenKind, string> = {
  key: "text-[#9cdcfe]",
  string: "text-[#ce9178]",
  number: "text-[#b5cea8]",
  literal: "text-[#569cd6]",
  punct: "text-[#d4d4d4]",
  space: "",
};

/** Raw records in a dark code block with a Copy JSON button. The colouring is purely visual: the text is exactly the JSON. */
export function JsonBlock({ value, title, testId }: { value: unknown; title: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(value, null, 2) ?? "null";
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch { return; }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <figure className="overflow-hidden rounded-xl border border-[#2b2b2b] bg-[#1e1e1e]" data-testid={testId}>
      <figcaption className="flex items-center justify-between gap-2 border-b border-[#2b2b2b] px-3 py-1.5 text-[12px] font-semibold text-[#c8c8c8]">
        <span>{title}</span>
        <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1 rounded-md border border-[#444] px-2 py-0.5 text-[12px] font-medium text-[#e8e8e8] hover:bg-[#2d2d2d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3d6bff]" data-testid="copy-json">
          {copied ? <Check aria-hidden className="h-3.5 w-3.5 text-[#6ad28a]" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy JSON"}
        </button>
      </figcaption>
      <pre className="max-h-[320px] overflow-auto p-3 font-mono text-[12px] leading-5" tabIndex={0} aria-label={`${title}, JSON`}>
        <code>{tokenizeJson(text).map((token, index) => <span key={index} className={COLOUR[token.kind]}>{token.text}</span>)}</code>
      </pre>
    </figure>
  );
}
