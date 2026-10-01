import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { formatDate } from "@/domain/dates";
import { ActionButton, DemoGuideButton } from "@/components/client";
import { MerchantHeader } from "@/components/merchant-header";
import { Badge, Pill } from "@/components/ui";
import { StepNav } from "@/components/step-nav";
import { loadPage } from "@/lib/page-data";
import { proposalLink } from "@/lib/service";
import { pendingActions } from "@/lib/views";

const STATUS_TONE: Record<string, "neutral" | "blue" | "green" | "amber" | "red" | "violet"> = {
  stalled: "neutral",
  clarifying: "amber",
  options_ready: "blue",
  approved: "blue",
  sent: "blue",
  accepted: "green",
  active: "green",
  amending: "amber",
  completed: "green",
  buyer_rejected: "red",
  needs_information: "amber",
  outside_templates: "red",
  no_feasible_structure: "red",
};

export default async function DealLayout({ children }: LayoutProps<"/">) {
  const { s, next, provenance, simulatedDate, today, live } = await loadPage();
  const pending = pendingActions(s);
  // The buyer proposal link exists only for versions the merchant has approved and sent.
  const latestShared = [...s.agreements].reverse().find((v) => v.status !== "draft" && v.status !== "merchant_approved");
  const buyerHref = latestShared ? proposalLink(latestShared) : null;
  const sentNow = [...s.agreements].reverse().find((v) => v.status === "sent");
  const stepHref = next ? (next.role === "buyer" && sentNow ? proposalLink(sentNow) : `/${next.view}`) : null;
  return (
    <>
      <MerchantHeader />
      <main id="main" className="flex-1">
        <div className="mx-auto w-full max-w-[1440px] px-3 py-4 sm:px-6 sm:py-6">
          <div className="rounded-[20px] bg-[#fbfbfc] p-3 shadow-[0_0_0_1px_var(--border)] sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Adaptive Deals · Deal</div>
                <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink sm:text-[28px]">Kestrel Lane Clinics · Annual digital marketing</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONE[s.status] ?? "neutral"}>Deal status: {s.status.replace(/_/g, " ")}</Badge>
                  <span data-testid="pending-actions">
                    <Badge tone={pending.total ? "amber" : "neutral"} title={`${pending.draftsToSend} draft(s) to send · ${pending.changeRequests} change request(s) · ${pending.revisionsToApprove} revision(s) to approve`}>
                      {pending.total ? `${pending.total} pending action${pending.total === 1 ? "" : "s"}` : "No pending actions"}
                    </Badge>
                  </span>
                  <Pill title="Every name, price and date is fictional">Synthetic data</Pill>
                  <span data-testid="provenance">
                    <Pill>{provenance}</Pill>
                  </span>
                  {simulatedDate ? <Badge tone="violet">Simulated date: {today}</Badge> : <Pill>Demo date: {formatDate(today)} (fixed clock, Asia/Kolkata)</Pill>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {buyerHref ? (
                  <Link href={buyerHref} data-testid="open-buyer-view" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#f7dfb4] bg-amber-weak px-3.5 text-[13px] font-semibold text-amber hover:bg-[#fdeccc]">
                    Open buyer proposal (demo) <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                  </Link>
                ) : null}
                <ActionButton body={{ action: "run_live" }} variant="secondary" testId="run-live" disabled={!live.available}>
                  Run live
                </ActionButton>
                <ActionButton body={{ action: "reset" }} variant="ghost" confirm="Reset the demo to the seeded synthetic state?" testId="reset">
                  Reset demo
                </ActionButton>
              </div>
            </div>
            {!live.available ? <p className="mt-2 text-[12px] text-muted">Run live is off: {live.reason.split(";")[0]}. The views show the stored run named above.</p> : null}

            <div className="mt-4 rounded-xl border border-line bg-surface px-4 py-3" data-testid="demo-guide">
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone="blue">Guided demo</Badge>
                {next && stepHref ? (
                  <>
                    <span className="text-[13px] text-ink-2" data-testid="demo-step">
                      <span className="font-semibold text-ink">{next.window}</span> · {next.title}
                      {next.role === "buyer" ? " (Demo buyer view)" : ""}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      <Link className="text-[13px] font-semibold text-blue hover:underline" href={stepHref}>
                        Go to view
                      </Link>
                      <DemoGuideButton href={stepHref} />
                    </span>
                  </>
                ) : (
                  <span className="text-[13px] text-ink-2">Storyboard complete. Reset the demo to run it again.</span>
                )}
              </div>
            </div>

            <StepNav />
            <div className="mt-5">{children}</div>
          </div>
          <footer className="px-2 py-6 text-center text-[12px] text-muted">
            Prototype for the Razorpay × ISB AI PM Build Challenge. Fictional merchant and buyer; synthetic figures; WhatsApp and recurring payments simulated. Not a Razorpay product.
          </footer>
        </div>
      </main>
    </>
  );
}
