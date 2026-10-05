import { MerchantHeader } from "@/components/merchant-header";
import { WalkthroughServer } from "@/components/walkthrough/walkthrough-server";

/**
 * Merchant deal layout: header and page chrome only. A page cannot pass state up to its layout,
 * so each stage page renders its own <StageShell viewing="…"> (status banner and stage tracker).
 */
export default async function DealLayout({ children, params }: LayoutProps<"/deals/[dealId]">) {
  const { dealId } = await params;
  return (
    <>
      <WalkthroughServer dealId={dealId} />
      <MerchantHeader />
      <main id="main" className="flex-1">
        {children}
        <footer className="px-2 py-6 text-center text-[12px] text-muted">Synthetic data · fictional merchant and buyer. Prototype for the Razorpay × ISB AI PM Build Challenge; not a Razorpay product.</footer>
      </main>
    </>
  );
}
