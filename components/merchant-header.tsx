import Link from "next/link";
import { BriefcaseBusiness, Calculator } from "lucide-react";
import { cx } from "./ui";
import { WalkthroughLauncher } from "./walkthrough/walkthrough-launcher";
import { OpenAudit } from "./audit/audit-drawer";

const tab = (active: boolean) => cx("relative flex h-full items-center gap-1.5 whitespace-nowrap text-[14px] hover:text-white", active ? "font-semibold text-white" : "font-medium text-white/75");
const underline = <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] rounded-t bg-[#3d6bff] shadow-[0_0_14px_#3d6bff]" />;

/**
 * The merchant's header: two places (Prices & costs, Deals) and one quiet menu for reviewers. Everything that
 * exists to explain the prototype rather than to run a deal (the guided walkthrough, the audit trail, the presenter
 * page, the fictional-data note) lives in that menu, so it never competes with the merchant's own work.
 */
export function MerchantHeader({ current = "deals", dealPage = false }: { current?: "deals" | "adaptive" | "economics"; dealPage?: boolean }) {
  const onDeals = current === "deals" || current === "adaptive";
  return (
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
          <details className="relative" data-testid="reviewer-menu">
            <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-white/25 px-2.5 text-[12px] font-semibold text-white/90 hover:bg-white/10" data-testid="reviewer-menu-toggle">For reviewers</summary>
            <div className="absolute right-0 z-50 mt-2 w-64 space-y-2 rounded-xl border border-line bg-surface p-3 text-ink shadow-[0_10px_30px_rgba(16,24,40,0.18)]">
              <p className="text-[12px] leading-5 text-ink-2">This is a prototype. Every merchant, buyer and amount in it is fictional, and no real payment is taken.</p>
              <div className="flex flex-col items-start gap-2 text-[13px]">
                <span className="[&_button]:!border-line-strong [&_button]:!text-ink [&_button:hover]:!bg-surface-muted"><WalkthroughLauncher /></span>
                {dealPage ? <OpenAudit section="evidence" testId="audit-details">Audit trail for this deal</OpenAudit> : null}
                <Link href="/presenter" className="font-semibold text-blue hover:underline" data-testid="nav-presenter">Presenter page</Link>
              </div>
            </div>
          </details>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#1d1d1f] text-[12px] font-bold" title="Pinecone Media Works (fictional merchant)" aria-label="Merchant: Pinecone Media Works (fictional)">
            PM
          </span>
        </div>
      </div>
      {/* Like the TEST pill on the Razorpay dashboard: a constant, quiet reminder that nothing here is real. */}
      <div className="pointer-events-none absolute left-1/2 top-14 z-30 hidden -translate-x-1/2 items-center gap-2 rounded-b-2xl bg-black px-5 py-1.5 text-[11px] font-semibold tracking-[0.28em] text-white sm:flex" data-testid="simulated-pill">
        <span aria-hidden className="h-2.5 w-5 rounded-full bg-[#1fb56f]" />
        SIMULATED
      </div>
    </header>
  );
}
