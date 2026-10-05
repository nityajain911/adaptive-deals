import { loadDeal } from "@/lib/deal-page";
import { replyContext } from "@/lib/demo-steps";
import { walkthroughCapabilities, walkthroughView } from "@/lib/walkthrough";
import { Walkthrough } from "./walkthrough";

export async function WalkthroughServer({ dealId, backHref }: { dealId: string; backHref?: string }) {
  const { s, progress } = await loadDeal(dealId);
  return <Walkthrough view={walkthroughView({ state: s, progress, dealId, capabilities: walkthroughCapabilities() })} reply={replyContext(s)} backHref={backHref} />;
}
