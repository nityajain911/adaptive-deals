import { MerchantHeader } from "@/components/merchant-header";

/**
 * Merchant deal layout: header and page chrome only. A page cannot pass state up to its layout,
 * so each stage page renders its own <StageShell viewing="…"> (status banner and stage tracker).
 */
export default function DealLayout({ children }: LayoutProps<"/deals/[dealId]">) {
  return (
    <>
      <MerchantHeader />
      <main id="main" className="flex-1">
        {children}
        <footer className="px-2 py-6 text-center text-[12px] text-muted">Synthetic data · fictional merchant and buyer. Prototype for the Razorpay × ISB AI PM Build Challenge; not a Razorpay product.</footer>
      </main>
    </>
  );
}
