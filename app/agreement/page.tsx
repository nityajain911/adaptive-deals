import { redirect } from "next/navigation";
import { isDelivered } from "@/lib/deal-records";
import { getState, proposalLink } from "@/lib/service";

/** Legacy route. `?role=buyer` opens the latest delivered buyer proposal; otherwise the current stage. */
export default async function LegacyAgreement(props: PageProps<"/agreement">) {
  if ((await props.searchParams).role === "buyer") {
    const s = await getState();
    const v = [...s.agreements].reverse().find((a) => isDelivered(s.deliveries, a.version));
    if (v) redirect(proposalLink(v));
  }
  redirect("/deals/hero");
}
