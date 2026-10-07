import Link from "next/link";
import { demoCase } from "@/data/synthetic/cases";
import { activeEconomics } from "@/lib/economics-store";
import { approxINR, headlineFor } from "@/lib/offer-copy";
import { STRATEGY_LABEL } from "@/domain/strategy";
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
  let count = 0;
  try {
    const view = strategyViewOf(s, await currentOutcome(s));
    leader = view.leader;
    count = view.ranked.length;
  } catch {
    leader = null;
  }
  const stale = s.economics.pinned.version !== active.version;

  return (
    <section className="rounded-xl border border-[#d6defe] bg-blue-weak/40 p-4" data-testid="rules-in-action" aria-label="Your rules in action">
      <h2 className="text-[15px] font-semibold text-ink">Your rules in action</h2>
      {leader ? (
        <>
          <p className="mt-1 text-[14px] text-ink" data-testid="rules-in-action-leader">
            For {buyer}, under version {s.economics.pinned.version}, <span className="font-medium">{STRATEGY_LABEL[s.economics.strategy]}</span> leads with “{headlineFor(leader)}”. You keep about {approxINR(leader.economics.netContributionPaise).replace(/^about /, "")}, and {count} offer{count === 1 ? "" : "s"} meet every rule.
          </p>
          {stale ? <p className="mt-1 text-[13px] text-amber" data-testid="rules-in-action-stale">This deal was evaluated under version {s.economics.pinned.version}; version {active.version} is active. Re-evaluate it on the Offer screen to see the effect.</p> : null}
          <Link href="/deals/hero/offer" className="mt-2 inline-block text-[13px] font-semibold text-blue hover:underline" data-testid="rules-in-action-link">See this recommendation</Link>
        </>
      ) : (
        <>
          <p className="mt-1 text-[14px] text-ink-2" data-testid="rules-in-action-empty">Every recommendation is checked against these rules. Start a buyer situation and its offers will appear here, so you can see what your rules allow.</p>
          <Link href="/deals" className="mt-2 inline-block text-[13px] font-semibold text-blue hover:underline" data-testid="rules-in-action-link">Choose a buyer situation</Link>
        </>
      )}
    </section>
  );
}
