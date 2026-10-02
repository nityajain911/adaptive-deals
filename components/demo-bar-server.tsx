import { loadDeal } from "@/lib/deal-page";
import { nextDemoStep, replyContext } from "@/lib/demo-steps";
import { DemoBar } from "./demo-bar";

/** Server data for the demo bar. The bar itself is not part of the product information architecture. */
export async function DemoBarServer({ dealId, backHref }: { dealId: string; backHref?: string }) {
  const { s, progress, today } = await loadDeal(dealId);
  return <DemoBar step={nextDemoStep(s, progress, dealId)} reply={replyContext(s)} simulatedDate={s.clockAdvances.length ? today : null} backHref={backHref} />;
}
