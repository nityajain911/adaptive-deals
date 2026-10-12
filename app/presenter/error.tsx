"use client";

import Link from "next/link";

/** If the presenter page cannot load something, say so in plain words and offer the way back. Never show a raw error. */
export default function PresenterError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="mx-auto w-full max-w-[700px] flex-1 px-4 py-10" data-testid="presenter-error">
      <h1 className="text-[22px] font-bold text-ink">The presenter page could not load everything</h1>
      <p className="mt-2 text-[14px] leading-6 text-ink-2">Using recorded runs instead: the demo itself does not need this page. Try again, or go back to the deals.</p>
      <div className="mt-4 flex gap-3">
        <button type="button" onClick={reset} className="min-h-10 rounded-lg bg-blue px-4 text-[14px] font-semibold text-white">Try again</button>
        <Link href="/deals" className="inline-flex min-h-10 items-center rounded-lg border border-line-strong px-4 text-[14px] font-semibold text-ink">Back to deals</Link>
      </div>
    </main>
  );
}
