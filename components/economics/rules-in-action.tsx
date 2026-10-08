import Link from "next/link";
import { demoCase } from "@/data/synthetic/cases";
import { activeEconomics } from "@/lib/economics-store";
import { approxINR, headlineFor } from "@/lib/offer-copy";
import { currentOutcome, getState, strategyViewOf } from "@/lib/service";

/**
 * Shows the merchant what their rules do: the open deal's recommendation under the version that is active
 * now. Every figure comes from the engine; nothing here can change a rule.
 */
export async function RulesInAction() {
  const s = await getState();
  const active = await activeEconomics();
  const buyer = demoCase(s.caseId)?.buyer.name ?? "the open deal";
  let leader: ReturnType<typeof strategyViewOf>["leader"] = null;
  try {
    const view = strategyViewOf(s, await currentOutcome(s));
    leader = view.leader;
  } catch {
    leader = null;
  }
  const stale = s.economics.pinned.version !== active.version;

  return (
    <section className="rounded-xl border border-[#d6defe] bg-blue-weak/40 p-4" data-testid="rules-in-action" aria-label="Your prices in action">
      {leader ? (
        <>
          <h2 className="text-[15px] font-semibold text-ink">Your prices in action</h2>
          <p className="mt-1 text-[14px] text-ink" data-testid="rules-in-action-leader">
            For {buyer}, the suggested offer is “{headlineFor(leader)}”. You&apos;d keep about {approxINR(leader.economics.netContributionPaise).replace(/^about /, "")}.
          </p>
          {stale ? <p className="mt-1 text-[13px] text-amber" data-testid="rules-in-action-stale">You have saved newer prices and costs since this was worked out. Open the offer to update it.</p> : null}
          <Link href="/deals/hero/offer" className="mt-2 inline-block text-[13px] font-semibold text-blue hover:underline" data-testid="rules-in-action-link">See the offer</Link>
        </>
      ) : (
        <>
          <h2 className="text-[15px] font-semibold text-ink">Your prices in action</h2>
          <p className="mt-1 text-[14px] text-ink-2" data-testid="rules-in-action-empty">Start a deal and the offers it suggests will show here, worked out from these prices and costs.</p>
          <Link href="/deals" className="mt-2 inline-block text-[13px] font-semibold text-blue hover:underline" data-testid="rules-in-action-link">Start a deal</Link>
        </>
      )}
    </section>
  );
}
