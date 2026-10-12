import Link from "next/link";
import { getState } from "@/lib/service";
import { OpenAudit } from "../audit/audit-drawer";
import { WalkthroughLauncher } from "../walkthrough/walkthrough-launcher";
import { FrameShell } from "./frame-shell";
import { ResetDealButton } from "./reset-deal-button";

/**
 * The presenter frame: one floating control, outside the merchant's navigation, that holds everything that
 * exists to explain the prototype rather than to run a deal. The merchant's screens carry none of it.
 */
export async function PresenterFrame({ dealPage = false }: { dealPage?: boolean }) {
  const { caseId } = await getState();
  return (
    <FrameShell>
      <div>
        <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#9db4ff]">Presenter tools</div>
        <p className="mt-1 text-[12px] leading-5 text-slate-300">Not part of the product. Every merchant, buyer and amount is fictional, and no real payment is taken.</p>
      </div>
      <div className="flex flex-col items-stretch gap-2 text-[13px]">
        <WalkthroughLauncher />
        {dealPage ? <span className="[&_button]:w-full [&_button]:justify-center [&_button]:!border-white/30 [&_button]:!text-white"><OpenAudit section="evidence" testId="audit-details">Audit trail for this deal</OpenAudit></span> : null}
        <Link href="/presenter" className="flex min-h-9 items-center justify-center rounded-lg border border-white/30 px-3 font-semibold text-white hover:bg-white/10" data-testid="nav-presenter">Presenter page · scenarios and Q&amp;A</Link>
      </div>
      <div className="border-t border-white/15 pt-3">
        <div className="mb-2 text-[12px] font-semibold text-slate-300">If you get stuck</div>
        <ResetDealButton caseId={caseId} />
      </div>
    </FrameShell>
  );
}
