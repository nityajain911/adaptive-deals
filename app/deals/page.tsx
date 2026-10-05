import { connection } from "next/server";
import { CasePicker, type CasePickerCard } from "@/components/deal/case-picker";
import { MerchantHeader } from "@/components/merchant-header";
import { allDemoCases } from "@/data/synthetic/cases";
import { getState } from "@/lib/service";

export const metadata = { title: "Commercial cases · Adaptive Deals" };

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
    current: item.id === s.caseId,
    actionLabel: "Start this case",
  }));

  return (
    <>
      <MerchantHeader current="deals" />
      <main id="main" className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-7 sm:px-6" data-testid="case-picker">
        <div className="max-w-[760px]">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Adaptive Deals</div>
          <h1 className="mt-1 text-[26px] font-bold tracking-tight text-ink sm:text-[32px]">Choose a commercial decision case</h1>
          <p className="mt-2 text-[14px] leading-6 text-ink-2">Each fictional case starts from a different buyer constraint. Review how Adaptive Deals narrows the conversation into a structure the merchant can approve—or explains why it should abstain.</p>
        </div>
        <div className="mt-6"><CasePicker cards={cards} activeCaseId={s.caseId} /></div>
      </main>
      <footer className="px-4 py-6 text-center text-[12px] text-muted">Synthetic data · fictional merchant and buyers. Prototype for the Razorpay × ISB AI PM Build Challenge; not a Razorpay product.</footer>
    </>
  );
}
