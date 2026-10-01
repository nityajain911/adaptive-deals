import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Buyer layout: no merchant navigation, guided-demo controls, run/reset, evaluation provenance or
 * internal deal status. The only demo affordance is the thin, labelled bar above the buyer frame.
 */
export default function ProposalLayout({ children }: LayoutProps<"/proposal">) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[#eef0f3]">
      <div className="bg-[#2a2140] text-white" data-testid="demo-bar">
        <div className="mx-auto flex max-w-[960px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-[12px]">
          <span className="rounded bg-white/15 px-1.5 py-0.5 font-semibold uppercase tracking-wide">Demo control</span>
          <span className="text-white/80">Not part of the buyer&apos;s page · demo buyer view, no login</span>
          <Link href="/agreement" className="ml-auto inline-flex items-center gap-1 font-semibold text-white underline-offset-2 hover:underline" data-testid="back-to-merchant">
            <ArrowLeft aria-hidden className="h-3.5 w-3.5" /> Back to merchant view
          </Link>
        </div>
      </div>
      <main id="main" className="flex-1 px-3 py-5 sm:py-10" data-testid="buyer-frame">
        {children}
      </main>
    </div>
  );
}
