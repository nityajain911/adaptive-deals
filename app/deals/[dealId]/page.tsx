import { redirect } from "next/navigation";
import { loadDeal, stageHref } from "@/lib/deal-page";

/** The deal home opens the stage that holds the current required action (spec §2.1, §3.4). */
export default async function DealHome(props: PageProps<"/deals/[dealId]">) {
  const { dealId } = await props.params;
  const { progress } = await loadDeal(dealId);
  redirect(stageHref(dealId, progress.stage));
}
