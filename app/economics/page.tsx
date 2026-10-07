import { connection } from "next/server";
import { EconomicsEditor } from "@/components/economics/economics-editor";
import { RulesInAction } from "@/components/economics/rules-in-action";
import { MerchantHeader } from "@/components/merchant-header";
import { activeEconomics } from "@/lib/economics-store";
import { WalkthroughServer } from "@/components/walkthrough/walkthrough-server";

export const metadata = { title: "Business economics · Adaptive Deals" };

export default async function EconomicsPage() {
  await connection();
  const active = await activeEconomics();
  return (
    <>
      <WalkthroughServer dealId="hero" route="economics" />
      <MerchantHeader current="economics" />
      <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-3 py-5 sm:px-6 sm:py-7" data-walkthrough="economics-page">
        <EconomicsEditor active={active}>
          <RulesInAction />
        </EconomicsEditor>
      </main>
      <footer className="px-4 py-6 text-center text-[12px] text-muted">Synthetic data · fictional merchant. Prototype for the Razorpay × ISB AI PM Build Challenge; not a Razorpay product.</footer>
    </>
  );
}
