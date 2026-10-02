import { redirect } from "next/navigation";

/** Legacy route: resolves through the deal home to the current stage (spec §2.1). */
export default function LegacyWorkspace() {
  redirect("/deals/hero");
}
