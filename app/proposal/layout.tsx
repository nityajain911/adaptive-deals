import { DemoBarServer } from "@/components/demo-bar-server";
import { WalkthroughServer } from "@/components/walkthrough/walkthrough-server";

/**
 * Buyer layout: no merchant navigation, guided-demo controls, run/reset, evaluation provenance or
 * internal deal status. The only demo affordance is the thin, labelled bar above the buyer frame.
 */
export default async function ProposalLayout({ children }: LayoutProps<"/proposal">) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[#eef0f3]">
      <DemoBarServer dealId="hero" backHref="/deals/hero" />
      <WalkthroughServer dealId="hero" backHref="/deals/hero" />
      <main id="main" className="flex-1 px-3 py-5 sm:py-10" data-testid="buyer-frame" data-walkthrough="final-terms">
        {children}
      </main>
    </div>
  );
}
