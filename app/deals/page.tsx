import { connection } from "next/server";
import { CasePicker } from "@/components/deal/case-picker";
import { casePickerCards } from "@/lib/case-picker-cards";
import { MerchantHeader } from "@/components/merchant-header";
import { WalkthroughWelcome } from "@/components/walkthrough/welcome";
import { WalkthroughServer } from "@/components/walkthrough/walkthrough-server";
import { allDemoCases } from "@/data/synthetic/cases";
import { modelProvenance } from "@/lib/model-provenance";
import type { CaseId } from "@/data/synthetic/cases";
import { demoCaseRunRecord, getState, listDeals } from "@/lib/service";

export const metadata = { title: "Active deals · Adaptive Deals" };

export default async function DealsPage() {
  await connection();
  const s = await getState();
  const listings = await listDeals();
  const byCase = Object.fromEntries(listings.map((item) => [item.caseId, { started: item.started, progress: item.progress }]));
  const modelOutput = Object.fromEntries(allDemoCases().map((item) => [item.id, modelProvenance(demoCaseRunRecord(item.id)).label])) as Record<CaseId, string>;
  const runs = Object.fromEntries(allDemoCases().map((item) => [item.id, demoCaseRunRecord(item.id)])) as Record<CaseId, ReturnType<typeof demoCaseRunRecord>>;
  const packageNames = Object.fromEntries(allDemoCases().flatMap((item) => item.deal.packages).map((pkg) => [pkg.id, pkg.name]));
  const cards = casePickerCards(allDemoCases(), s.caseId, modelOutput, byCase, runs, packageNames);

  return (
    <>
      <WalkthroughServer dealId="hero" />
      <MerchantHeader current="deals" />
      <main id="main" className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-7 sm:px-6" data-testid="case-picker" data-walkthrough="case-picker">
        <WalkthroughWelcome />
        <h1 className="text-[26px] font-bold tracking-tight text-ink sm:text-[32px]">Active deals</h1>
        <div className="mt-5"><CasePicker cards={cards} activeCaseId={s.caseId} /></div>
      </main>
      <footer className="px-4 py-6 text-center text-[12px] text-muted">Synthetic data · fictional merchant and buyers. Prototype for the Razorpay × ISB AI PM Build Challenge; not a Razorpay product.</footer>
    </>
  );
}
