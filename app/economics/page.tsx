import { connection } from "next/server";
import { EconomicsEditor } from "@/components/economics/economics-editor";
import { MerchantHeader } from "@/components/merchant-header";
import { activeEconomics } from "@/lib/economics-store";

export const metadata = { title: "Business economics · Adaptive Deals" };

export default async function EconomicsPage() {
  await connection();
  const active = await activeEconomics();
  return (
    <>
      <MerchantHeader current="economics" />
      <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-3 py-5 sm:px-6 sm:py-7">
        <EconomicsEditor active={active} />
      </main>
      <footer className="px-4 py-6 text-center text-[12px] text-muted">Synthetic data · fictional merchant. Prototype for the Razorpay × ISB AI PM Build Challenge; not a Razorpay product.</footer>
    </>
  );
}
