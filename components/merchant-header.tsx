import Link from "next/link";
import { BriefcaseBusiness, Calculator } from "lucide-react";
import { cx } from "./ui";
import { PresenterFrame } from "./presenter/presenter-frame";

const tab = (active: boolean) => cx("relative flex h-full items-center gap-1.5 whitespace-nowrap text-[14px] hover:text-white", active ? "font-semibold text-white" : "font-medium text-white/75");
const underline = <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] rounded-t bg-[#3d6bff] shadow-[0_0_14px_#3d6bff]" />;

/**
 * The merchant's header: two places (Prices & costs, Deals). Everything that exists to explain the prototype rather
 * than to run a deal (the guided walkthrough, the audit trail, the presenter page, quick resets) lives in the
 * separate presenter frame, so it never competes with the merchant's own work. The SIMULATED pill stays.
 */
export function MerchantHeader({ current = "deals", dealPage = false }: { current?: "deals" | "adaptive" | "economics"; dealPage?: boolean }) {
  const onDeals = current === "deals" || current === "adaptive";
  return (
    <>
    <header className="relative bg-header text-white">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-3 sm:gap-6 sm:px-6">
        <span className="hidden text-[19px] font-extrabold italic tracking-tight sm:inline" aria-label="Razorpay">
          <span className="text-[#3d6bff]">/</span>Razorpay
        </span>
        <nav aria-label="Main" className="flex h-full items-center gap-4 sm:gap-6">
          <Link href="/economics" aria-current={current === "economics" ? "page" : undefined} className={tab(current === "economics")} data-testid="nav-prices">
            <Calculator aria-hidden className="hidden h-4 w-4 sm:block" />
            <span className="hidden lg:inline">Prices &amp; costs</span><span className="lg:hidden">Prices</span>
            {current === "economics" ? underline : null}
          </Link>
          <Link href="/deals" aria-current={onDeals ? "page" : undefined} className={tab(onDeals)} data-testid="nav-deals">
            <BriefcaseBusiness aria-hidden className="hidden h-4 w-4 sm:block" />
            Deals
            {onDeals ? underline : null}
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#1d1d1f] text-[12px] font-bold" title="Pinecone Media Works (fictional merchant)" aria-label="Merchant: Pinecone Media Works (fictional)">
            PM
          </span>
        </div>
      </div>
      {/* Like the TEST pill on the Razorpay dashboard: a constant, quiet reminder that nothing here is real. */}
      <div className="pointer-events-none absolute left-1/2 top-14 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-b-2xl bg-black px-3 py-1 text-[10px] font-semibold tracking-[0.22em] text-white sm:gap-2 sm:px-5 sm:py-1.5 sm:text-[11px] sm:tracking-[0.28em]" data-testid="simulated-pill" role="status" aria-label="Simulated: nothing here is real">
        <span aria-hidden className="h-2.5 w-5 rounded-full bg-[#1fb56f]" />
        SIMULATED
      </div>
    </header>
    <PresenterFrame dealPage={dealPage} />
    </>
  );
}
