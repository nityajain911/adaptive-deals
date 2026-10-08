import { connection } from "next/server";
import { CasePicker, type CasePickerCard } from "@/components/deal/case-picker";
import Link from "next/link";
import { MerchantHeader } from "@/components/merchant-header";
import { WalkthroughWelcome } from "@/components/walkthrough/welcome";
import { WalkthroughServer } from "@/components/walkthrough/walkthrough-server";
import { allDemoCases } from "@/data/synthetic/cases";
import { modelProvenance } from "@/lib/model-provenance";
import { demoCaseRunRecord, getState } from "@/lib/service";

export const metadata = { title: "Deals · Adaptive Deals" };

export default async function DealsPage() {
  await connection();
  const s = await getState();
  const cards: CasePickerCard[] = allDemoCases().map((item) => ({
    id: item.id,
    title: item.title,
    buyer: item.buyer.name,
    proposal: item.proposalSummary,
    barrier: item.barrier,
    proofPoint: item.proofPoint,
    provenance: item.provenance,
    modelOutput: modelProvenance(demoCaseRunRecord(item.id)).label,
    current: item.id === s.caseId,
    actionLabel: "Start this deal",
  }));

  return (
    <>
      <WalkthroughServer dealId="hero" />
      <MerchantHeader current="deals" />
      <main id="main" className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-7 sm:px-6" data-testid="case-picker" data-walkthrough="case-picker">
        <WalkthroughWelcome />
        <div className="max-w-[760px]">
          <h1 className="text-[26px] font-bold tracking-tight text-ink sm:text-[32px]">Start a deal</h1>
          <p className="mt-2 text-[14px] leading-6 text-ink-2">A customer has told you your quote doesn&apos;t fit their budget. Pick a situation to see what they said and the offer we&apos;d suggest.</p>
        </div>
        <p className="mt-3 max-w-[760px] text-[13px] text-ink-2" data-testid="deals-economics-note">Offers are worked out from your <Link href="/economics" className="font-semibold text-blue hover:underline" data-testid="deals-economics-link">prices &amp; costs</Link>.</p>
        <div className="mt-6"><CasePicker cards={cards} activeCaseId={s.caseId} /></div>
      </main>
      <footer className="px-4 py-6 text-center text-[12px] text-muted">Synthetic data · fictional merchant and buyers. Prototype for the Razorpay × ISB AI PM Build Challenge; not a Razorpay product.</footer>
    </>
  );
}
