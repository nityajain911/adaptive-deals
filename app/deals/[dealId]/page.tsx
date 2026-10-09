import { redirect } from "next/navigation";
import { loadDeal, stageHref } from "@/lib/deal-page";

/** The deal home opens the stage that holds the current required action (spec §2.1, §3.4). */
export default async function DealHome(props: PageProps<"/deals/[dealId]">) {
  const { dealId } = await props.params;
  const { s, progress } = await loadDeal(dealId);
  // A deal the merchant has not yet read opens on Understand, even when nothing needs asking: it shows what the buyer said.
  const beforeSend = ["offer.review", "offer.no_feasible", "offer.outside_templates"].includes(progress.rule);
  if (beforeSend && !s.understandReviewed && s.selectedOption === null && s.agreements.length === 0) redirect(stageHref(dealId, "understand"));
  redirect(stageHref(dealId, progress.stage));
}
